// ========== ONBOARDING SYSTEM ==========

let currentOnboardingStep = 0;
const totalSteps = 5;

// Check if onboarding should be shown
function shouldShowOnboarding() {
    // Check if onboarding is enabled (default to true if not set)
    const enableOnboarding = window.ENABLE_ONBOARDING !== undefined ? window.ENABLE_ONBOARDING : true;
    if (!enableOnboarding) return false;
    
    // Always show onboarding for testing (comment out to use localStorage check)
    return true;
    
    // Check localStorage for first-time visit (disabled for testing)
    // const hasSeenOnboarding = localStorage.getItem('hasSeenOnboarding');
    // return !hasSeenOnboarding;
}

// Show onboarding overlay
function showOnboarding() {
    const overlay = document.getElementById('onboardingOverlay');
    if (overlay) {
        overlay.style.display = 'flex';
        showStep(0);
    }
}

// Hide onboarding and mark as seen
function hideOnboarding() {
    // Clear auto-advance timer and progress
    if (autoAdvanceTimer) {
        clearTimeout(autoAdvanceTimer);
    }
    if (progressInterval) {
        clearInterval(progressInterval);
    }
    
    const overlay = document.getElementById('onboardingOverlay');
    if (overlay) {
        overlay.style.display = 'none';
        localStorage.setItem('hasSeenOnboarding', 'true');
    }
}

let autoAdvanceTimer = null;
let progressInterval = null;

// Animate progress bar
function animateProgressBar(duration) {
    const progressBar = document.getElementById('progressTimerBar');
    if (!progressBar) return;
    
    // Reset progress bar
    progressBar.style.width = '0%';
    
    // Clear any existing interval
    if (progressInterval) {
        clearInterval(progressInterval);
    }
    
    const startTime = Date.now();
    const updateInterval = 50; // Update every 50ms for smooth animation
    
    progressInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min((elapsed / duration) * 100, 100);
        progressBar.style.width = progress + '%';
        
        if (progress >= 100) {
            clearInterval(progressInterval);
        }
    }, updateInterval);
}

// Show specific step
function showStep(stepIndex) {
    currentOnboardingStep = stepIndex;
    
    // Clear any existing timer and progress
    if (autoAdvanceTimer) {
        clearTimeout(autoAdvanceTimer);
    }
    if (progressInterval) {
        clearInterval(progressInterval);
    }
    
    // Reset progress bar
    const progressBar = document.getElementById('progressTimerBar');
    if (progressBar) {
        progressBar.style.width = '0%';
    }
    
    // Hide all steps
    document.querySelectorAll('.onboarding-step').forEach(step => {
        step.style.display = 'none';
    });
    
    // Show current step
    const currentStep = document.querySelector(`.onboarding-step[data-step="${stepIndex}"]`);
    if (currentStep) {
        currentStep.style.display = 'flex';
    }
    
    // Update breadcrumbs
    document.querySelectorAll('.breadcrumb').forEach((crumb, index) => {
        crumb.classList.remove('active', 'completed');
        if (index < stepIndex) {
            crumb.classList.add('completed');
        } else if (index === stepIndex) {
            crumb.classList.add('active');
        }
    });
    
    // Update navigation buttons
    const prevBtn = document.getElementById('prevStep');
    const nextBtn = document.getElementById('nextStep');
    
    if (prevBtn) {
        prevBtn.style.display = stepIndex > 0 ? 'block' : 'none';
    }
    
    if (nextBtn) {
        nextBtn.textContent = stepIndex === totalSteps - 1 ? 'Get Started' : 'Next';
    }
    
    // Auto-advance to next step after 5 seconds
    if (stepIndex < totalSteps - 1) {
        const duration = 5000; // 5 seconds
        
        // Start progress bar animation
        animateProgressBar(duration);
        
        // Set timer to advance
        autoAdvanceTimer = setTimeout(() => {
            showStep(stepIndex + 1);
        }, duration);
    }
}

// Initialize onboarding on page load
window.addEventListener('DOMContentLoaded', () => {
    if (shouldShowOnboarding()) {
        showOnboarding();
    }
    
    // Skip button
    const skipBtn = document.getElementById('skipOnboarding');
    if (skipBtn) {
        skipBtn.addEventListener('click', hideOnboarding);
    }
    
    // Next button
    const nextBtn = document.getElementById('nextStep');
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (currentOnboardingStep < totalSteps - 1) {
                showStep(currentOnboardingStep + 1);
            } else {
                hideOnboarding();
            }
        });
    }
    
    // Previous button
    const prevBtn = document.getElementById('prevStep');
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentOnboardingStep > 0) {
                showStep(currentOnboardingStep - 1);
            }
        });
    }
    
    // Breadcrumb click navigation
    document.querySelectorAll('.breadcrumb').forEach((crumb, index) => {
        crumb.addEventListener('click', () => {
            showStep(index);
        });
    });
});
