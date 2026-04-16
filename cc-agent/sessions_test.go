package main

import (
	"testing"
	"time"
)

func TestParseAccessLogSession(t *testing.T) {
	line := "2026/04/16 20:55:10 from tcp:203.0.113.4:51920 accepted tcp:gemini.google.com:443 email: test-user"
	record, ok := parseAccessLogSession(line, time.Date(2026, 4, 16, 20, 56, 0, 0, time.Local))
	if !ok {
		t.Fatal("expected access log line to parse")
	}
	if record.Email != "test-user" {
		t.Fatalf("email = %q, want test-user", record.Email)
	}
	if record.ClientIP != "203.0.113.4" {
		t.Fatalf("client ip = %q, want 203.0.113.4", record.ClientIP)
	}
	if record.Source != "xray-agent-sessions" {
		t.Fatalf("source = %q, want xray-agent-sessions", record.Source)
	}
}
