import axios from "axios"
import { orthancApiUrl } from "../globalConfigurations"

/**
 * CXAS API wrapper
 * Separate API module for CXAS functionality to avoid modifying orthancApi.js
 */
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
    }
}
