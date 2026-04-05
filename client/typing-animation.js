// Typing animation system for cluster label corrections
class TypingAnimation {
    constructor() {
        this.animations = new Map(); // clusterId -> animation state
    }

    /**
     * Start a backspace + retype animation for a cluster label
     * @param {string} clusterId - Cluster ID
     * @param {string} oldLabel - Original label with typo
     * @param {string} newLabel - Corrected label
     * @param {number} backspaceSpeed - Characters per second for backspace (default: 20)
     * @param {number} typeSpeed - Characters per second for typing (default: 15)
     */
    startAnimation(clusterId, oldLabel, newLabel, backspaceSpeed = 20, typeSpeed = 15) {
        const animation = {
            clusterId,
            oldLabel,
            newLabel,
            currentText: oldLabel,
            phase: 'backspace', // 'backspace' or 'typing'
            backspaceSpeed: 1000 / backspaceSpeed, // ms per character
            typeSpeed: 1000 / typeSpeed, // ms per character
            lastUpdate: Date.now(),
            backspaceIndex: oldLabel.length,
            typeIndex: 0,
            complete: false
        };

        this.animations.set(clusterId, animation);
        console.log(`⌨️ Starting typing animation: "${oldLabel}" → "${newLabel}"`);
    }

    /**
     * Update all active animations
     * Call this in your draw() loop
     */
    update() {
        const now = Date.now();

        this.animations.forEach((anim, clusterId) => {
            if (anim.complete) return;

            const elapsed = now - anim.lastUpdate;

            if (anim.phase === 'backspace') {
                // Backspace phase
                if (elapsed >= anim.backspaceSpeed) {
                    anim.backspaceIndex--;
                    anim.currentText = anim.oldLabel.substring(0, anim.backspaceIndex);
                    anim.lastUpdate = now;

                    // Switch to typing phase when fully backspaced
                    if (anim.backspaceIndex <= 0) {
                        anim.phase = 'typing';
                        anim.currentText = '';
                    }
                }
            } else if (anim.phase === 'typing') {
                // Typing phase
                if (elapsed >= anim.typeSpeed) {
                    anim.typeIndex++;
                    anim.currentText = anim.newLabel.substring(0, anim.typeIndex);
                    anim.lastUpdate = now;

                    // Mark complete when fully typed
                    if (anim.typeIndex >= anim.newLabel.length) {
                        anim.complete = true;
                        console.log(`✅ Typing animation complete: "${anim.newLabel}"`);
                    }
                }
            }
        });
    }

    /**
     * Get the current display text for a cluster
     * @param {string} clusterId - Cluster ID
     * @returns {string|null} - Current animated text, or null if no animation
     */
    getCurrentText(clusterId) {
        const anim = this.animations.get(clusterId);
        if (!anim) return null;
        return anim.currentText;
    }

    /**
     * Check if animation is complete for a cluster
     * @param {string} clusterId - Cluster ID
     * @returns {boolean}
     */
    isComplete(clusterId) {
        const anim = this.animations.get(clusterId);
        return !anim || anim.complete;
    }

    /**
     * Check if any animations are active
     * @returns {boolean}
     */
    hasActiveAnimations() {
        for (const anim of this.animations.values()) {
            if (!anim.complete) return true;
        }
        return false;
    }

    /**
     * Clear all animations
     */
    clear() {
        this.animations.clear();
    }

    /**
     * Remove completed animations
     */
    cleanupCompleted() {
        for (const [clusterId, anim] of this.animations.entries()) {
            if (anim.complete) {
                this.animations.delete(clusterId);
            }
        }
    }
}

// Create global instance
const typingAnimation = new TypingAnimation();
