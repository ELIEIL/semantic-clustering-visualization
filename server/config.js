// Configuration file
const CONFIG = {
    // Set to true to enable admin panel, false to disable
    ADMIN_PANEL_ENABLED: false,
    
    // Other config options
    PROFANITY_FILTER_ENABLED: true,
    RATE_LIMITING_ENABLED: true,
    
    // Maximum expected participants (shown in waiting room UI)
    MAX_PARTICIPANTS: 25
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
