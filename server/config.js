// Configuration file
const CONFIG = {
    // Set to true to enable admin panel, false to disable
    ADMIN_PANEL_ENABLED: false,
    
    // Other config options
    PROFANITY_FILTER_ENABLED: true,
    RATE_LIMITING_ENABLED: true
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
