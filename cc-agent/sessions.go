package main

import (
	"bufio"
	"net"
	"os"
	"regexp"
	"sort"
	"strings"
	"time"
)

type SessionRecord struct {
	Email      string `json:"email"`
	ClientIP   string `json:"client_ip"`
	ClientAddr string `json:"client_addr,omitempty"`
	LastSeen   int64  `json:"last_seen"`
	Source     string `json:"source"`
}

var (
	accessLogTimeRe  = regexp.MustCompile(`^(\d{4})/(\d{2})/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})`)
	accessLogEmailRe = regexp.MustCompile(`(?i)(?:email|user):\s*([A-Za-z0-9._@+\-]+)`)
	accessLogFromRe  = regexp.MustCompile(`(?i)\bfrom\s+((?:tcp|udp):)?(\[[^\]]+\]|[0-9A-Fa-f:.]+)(?::\d+)?`)
)

func ReadActiveSessions(path string, window time.Duration, maxLines int) ([]SessionRecord, error) {
	if maxLines <= 0 {
		maxLines = 5000
	}

	file, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return []SessionRecord{}, nil
		}
		return nil, err
	}
	defer file.Close()

	lines := make([]string, 0, maxLines)
	scanner := bufio.NewScanner(file)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if len(lines) == maxLines {
			copy(lines, lines[1:])
			lines[maxLines-1] = line
		} else {
			lines = append(lines, line)
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}

	now := time.Now()
	activeAfter := now.Add(-window)
	byKey := make(map[string]SessionRecord)

	for _, line := range lines {
		record, ok := parseAccessLogSession(line, now)
		if !ok || record.LastSeen < activeAfter.UnixMilli() {
			continue
		}
		key := record.Email + "|" + record.ClientIP
		if existing, exists := byKey[key]; !exists || record.LastSeen > existing.LastSeen {
			byKey[key] = record
		}
	}

	sessions := make([]SessionRecord, 0, len(byKey))
	for _, record := range byKey {
		sessions = append(sessions, record)
	}
	sort.Slice(sessions, func(i, j int) bool {
		return sessions[i].LastSeen > sessions[j].LastSeen
	})

	return sessions, nil
}

func parseAccessLogSession(line string, now time.Time) (SessionRecord, bool) {
	emailMatch := accessLogEmailRe.FindStringSubmatch(line)
	fromMatch := accessLogFromRe.FindStringSubmatch(line)
	if len(emailMatch) < 2 || len(fromMatch) < 3 {
		return SessionRecord{}, false
	}

	clientAddr := strings.TrimPrefix(fromMatch[0], "from ")
	clientIP := cleanClientIP(fromMatch[2])
	if clientIP == "" {
		return SessionRecord{}, false
	}

	seenAt := now
	if parsed, ok := parseAccessLogTime(line, now.Location()); ok {
		seenAt = parsed
	}

	return SessionRecord{
		Email:      emailMatch[1],
		ClientIP:   clientIP,
		ClientAddr: clientAddr,
		LastSeen:   seenAt.UnixMilli(),
		Source:     "xray-agent-sessions",
	}, true
}

func cleanClientIP(value string) string {
	raw := strings.Trim(value, "[]")
	if host, _, err := net.SplitHostPort(raw); err == nil {
		return strings.Trim(host, "[]")
	}
	if idx := strings.LastIndex(raw, ":"); idx > -1 {
		tail := raw[idx+1:]
		if tail != "" {
			allDigits := true
			for _, ch := range tail {
				if ch < '0' || ch > '9' {
					allDigits = false
					break
				}
			}
			if allDigits && strings.Count(raw, ":") == 1 {
				return raw[:idx]
			}
		}
	}
	return raw
}

func parseAccessLogTime(line string, loc *time.Location) (time.Time, bool) {
	match := accessLogTimeRe.FindStringSubmatch(line)
	if len(match) != 7 {
		return time.Time{}, false
	}

	parsed, err := time.ParseInLocation("2006/01/02 15:04:05", strings.Join([]string{
		match[1], "/", match[2], "/", match[3], " ", match[4], ":", match[5], ":", match[6],
	}, ""), loc)
	if err != nil {
		return time.Time{}, false
	}

	return parsed, true
}
