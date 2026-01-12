/**
 * CXAS Class Definitions
 * Maps class indices to readable names
 * Based on docs/available_classes.md
 */

export const CXAS_CLASSES = {
    141: "right upper zone lung",
    142: "right mid zone lung",
    143: "right lung base",
    145: "left upper zone lung",
    146: "left mid zone lung",
    147: "left lung base"
};

/**
 * Get display name for a class index
 */
export function getClassName(classIndex) {
    return CXAS_CLASSES[classIndex] || `Class ${classIndex}`;
}

/**
 * Get all available class indices
 */
export function getAvailableClassIndices() {
    return Object.keys(CXAS_CLASSES).map(k => parseInt(k));
}

/**
 * Get class configuration from options
 * Returns array of class indices that should be enabled
 */
export function getEnabledClasses(segmentationOptions) {
    // If segmentationOptions is an array of class indices, return it
    if (Array.isArray(segmentationOptions)) {
        return segmentationOptions;
    }
    
    // If it's an object with boolean flags, convert to class indices
    if (typeof segmentationOptions === 'object' && segmentationOptions !== null) {
        const enabled = [];
        // Legacy format: convert named options to class indices
        // This is for backward compatibility
        if (segmentationOptions.enableLungs) {
            enabled.push(...[141, 142, 143, 145, 146, 147]);
        }
        // Add other legacy mappings if needed
        return enabled;
    }
    
    // Default: return empty array
    return [];
}
