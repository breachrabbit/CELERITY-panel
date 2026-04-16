/**
 * Panel settings model
 */

const mongoose = require('mongoose');

const DEFAULT_HAPP_DARK_COLOR_PROFILE = JSON.stringify({
    backgroundColors: ['#050A3C', '#0E174F'],
    buttonColor: '#08C5CB',
    buttonTextColor: '#050A3C',
    topBarButtonsColor: '#DDE5ED',
    subscriptionTrafficBackgroundColor: '#0E174F',
    subscriptionTrafficTextColor: '#FFFFFF',
    subscriptionInfoBackgroundColor: '#182463',
    subscriptionInfoTextColor: '#DDE5ED',
    serverRowBackgroundColor: '#0E174F',
    serverRowTitleTextColor: '#FFFFFF',
    serverRowSubTitleTextColor: '#DDE5ED',
    profileTitleTextColor: '#FFFFFF',
    profileSubtitleTextColor: '#DDE5ED',
    supportIconColor: '#08C5CB',
    profileWebPageIconColor: '#08C5CB',
});

const settingsSchema = new mongoose.Schema({
    _id: {
        type: String,
        default: 'settings',
    },
    
    loadBalancing: {
        enabled: { type: Boolean, default: false },
        hideOverloaded: { type: Boolean, default: false },
    },
    
    deviceGracePeriod: { type: Number, default: 15 },
    
    cache: {
        subscriptionTTL: { type: Number, default: 3600 },
        userTTL: { type: Number, default: 900 },
        onlineSessionsTTL: { type: Number, default: 10 },
        activeNodesTTL: { type: Number, default: 30 },
    },
    
    rateLimit: {
        subscriptionPerMinute: { type: Number, default: 100 },
        authPerSecond: { type: Number, default: 200 },
    },
    
    sshPool: {
        enabled: { type: Boolean, default: true },
        maxIdleTime: { type: Number, default: 120 },        // seconds
        keepAliveInterval: { type: Number, default: 30 },   // seconds
        connectTimeout: { type: Number, default: 15 },      // seconds
        maxRetries: { type: Number, default: 2 },
    },
    
    nodeAuth: {
        // Allow nodes to connect to panel auth API with self-signed/invalid SSL
        // Enable if panel uses HTTP or self-signed certificate
        insecure: { type: Boolean, default: true },
    },

    featureFlags: {
        // Hybrid cascade (Xray + Hysteria sidecar) toggle from admin panel
        cascadeHybrid: { type: Boolean, default: process.env.FEATURE_CASCADE_HYBRID === 'true' },
    },
    
    backup: {
        enabled: { type: Boolean, default: false },
        intervalHours: { type: Number, default: 24 },       // интервал в часах
        keepLast: { type: Number, default: 7 },             // сколько хранить локально
        lastBackup: { type: Date, default: null },          // время последнего бэкапа
        
        // S3 настройки (опционально)
        s3: {
            enabled: { type: Boolean, default: false },
            endpoint: { type: String, default: '' },        // для MinIO и подобных
            region: { type: String, default: 'us-east-1' },
            bucket: { type: String, default: '' },
            prefix: { type: String, default: 'backups' },   // префикс в bucket
            accessKeyId: { type: String, default: '' },
            secretAccessKey: { type: String, default: '' },
            keepLast: { type: Number, default: 30 },        // сколько хранить в S3
        },
    },

    webhook: {
        enabled: { type: Boolean, default: false },
        url: { type: String, default: '' },
        secret: { type: String, default: '' },
        // empty = all events; non-empty = only listed events
        events: { type: [String], default: [] },
    },

    subscription: {
        supportUrl:     { type: String, default: '' },
        webPageUrl:     { type: String, default: '' },
        happProviderId: { type: String, default: '' },
        logoUrl:        { type: String, default: '' },
        pageTitle:      { type: String, default: '' },
        updateInterval: { type: Number, default: 12 },
        buttons: {
            type: [{
                _id: false,
                label: { type: String, default: '' },
                url:   { type: String, default: '' },
                icon:  { type: String, default: '' },
            }],
            default: [],
        },
        happ: {
            announce: { type: String, default: '' },
            infoText: { type: String, default: '' },
            infoColor: { type: String, enum: ['', 'blue', 'green', 'red'], default: 'blue' },
            infoButtonText: { type: String, default: '' },
            infoButtonLink: { type: String, default: '' },
            expireBannerEnabled: { type: Boolean, default: false },
            expireButtonLink: { type: String, default: '' },
            hideSettings: { type: Boolean, default: false },
            notifyExpire: { type: Boolean, default: false },
            alwaysHwid: { type: Boolean, default: false },
            pingType: { type: String, enum: ['', 'proxy', 'proxy-head', 'tcp', 'icmp'], default: 'proxy' },
            pingUrl: { type: String, default: 'https://cp.cloudflare.com/generate_204' },
            colorProfile: { type: String, default: DEFAULT_HAPP_DARK_COLOR_PROFILE },
            display: {
                showTrafficProgress: { type: Boolean, default: true },
                showTrafficDetails: { type: Boolean, default: true },
                showDevices: { type: Boolean, default: true },
                showSupportStatus: { type: Boolean, default: true },
                showSupportPeriod: { type: Boolean, default: true },
            },
            support: {
                enabled: { type: Boolean, default: true },
                amountRub: { type: Number, default: 200 },
                periodDays: { type: Number, default: 30 },
                buttonText: { type: String, default: 'Поддержать' },
                buttonLink: { type: String, default: '' },
                neutralText: {
                    type: String,
                    default: 'Сервис работает в обычном режиме. Если захотите, можно поддержать инфраструктуру и сопровождение.',
                },
                activeText: {
                    type: String,
                    default: 'Спасибо. Поддержка инфраструктуры в этом периоде отмечена.',
                },
                overdueText: {
                    type: String,
                    default: 'Сервис продолжает работать. При желании можно поддержать инфраструктуру в текущем периоде.',
                },
            },
        },
    },
    
}, { timestamps: true });

settingsSchema.statics.get = async function() {
    let settings = await this.findById('settings');
    if (!settings) {
        settings = await this.create({ _id: 'settings' });
    }
    return settings;
};

settingsSchema.statics.update = async function(updates) {
    return this.findByIdAndUpdate('settings', { $set: updates }, { 
        new: true, 
        upsert: true,
        setDefaultsOnInsert: true,
    });
};

module.exports = mongoose.model('Settings', settingsSchema);
module.exports.DEFAULT_HAPP_DARK_COLOR_PROFILE = DEFAULT_HAPP_DARK_COLOR_PROFILE;
