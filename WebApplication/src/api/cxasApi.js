import axios from "axios"
import { orthancApiUrl } from "../globalConfigurations"

/**
 * CXAS API wrapper
 * Separate API module for CXAS functionality to avoid modifying orthancApi.js
 */

// Cache for CXAS config to avoid repeated API calls
let cachedConfig = null;

export default {
    async segment(payload) {
        const response = await axios.post(orthancApiUrl + "cxas/segment", payload);
        return response;
    },
    async extractFeatures(payload) {
        const response = await axios.post(orthancApiUrl + "cxas/extract-features", payload);
        return response;
    },
    async getStatus() {
        const response = await axios.get(orthancApiUrl + "cxas/status");
        return response.data;
    },
    async getConfig(forceRefresh = false) {
        // Return cached config if available and not forcing refresh
        if (cachedConfig && !forceRefresh) {
            return cachedConfig;
        }
        try {
            const response = await axios.get(orthancApiUrl + "cxas/configuration");
            cachedConfig = response.data;
            return cachedConfig;
        } catch (error) {
            console.warn("Failed to load CXAS config from API, using defaults:", error);
            // Return default config if API fails
            return {
                EnableCXAS: true,
                Levels: ["instance", "series"],
                DefaultOutputFormat: "png",
                DefaultStoreSegmentation: true,
                AvailableClasses: [141, 142, 143, 145, 146, 147],
                DefaultEnabledClasses: [141, 142, 143, 145, 146, 147],
                ClassLabels: {
                    "141": "Right Upper Zone Lung",
                    "142": "Right Mid Zone Lung",
                    "143": "Right Lung Base",
                    "145": "Left Upper Zone Lung",
                    "146": "Left Mid Zone Lung",
                    "147": "Left Lung Base"
                }
            };
        }
    },
    clearConfigCache() {
        cachedConfig = null;
    }
}
