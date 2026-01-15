<script>
import { mapState } from "vuex"
import CXASModal from "./CXASModal.vue"
import cxasApi from "../api/cxasApi"

export default {
    props: ["resourceOrthancId", "resourceDicomUid", "resourceLevel", "customClass", "smallIcons"],
    data() {
        return {
            componentId: Math.random().toString(36).substring(7),
            cxasConfig: null,
            configLoaded: false
        };
    },
    async mounted() {
        // Load CXAS config from API
        try {
            this.cxasConfig = await cxasApi.getConfig();
            this.configLoaded = true;
        } catch (error) {
            console.warn("Failed to load CXAS config:", error);
            this.configLoaded = true; // Mark as loaded even on error to show button
        }
    },
    computed: {
        ...mapState({
            uiOptions: state => state.configuration.uiOptions,
            studiesSourceType: state => state.studies.sourceType,
            selectedStudiesIds: state => state.studies.selectedStudiesIds
        }),
        hasCXASButton() {
            // Wait for config to load
            if (!this.configLoaded) {
                return false;
            }

            // Check if CXAS is enabled
            if (this.cxasConfig && this.cxasConfig.EnableCXAS === false) {
                return false;
            }

            // Check if current resource level is allowed in Levels configuration
            const allowedLevels = this.cxasConfig?.Levels;
            if (allowedLevels && Array.isArray(allowedLevels) && allowedLevels.length > 0) {
                return allowedLevels.includes(this.resourceLevel);
            }

            // If Levels is not configured, show at all levels (backward compatibility)
            return true;
        },
        buttonClasses() {
            if (this.smallIcons) {
                return "btn-icon-small";
            } else {
                return "btn-icon";
            }
        },
        modalId() {
            if (this.resourceLevel === 'bulk') {
                return 'cxas-modal-bulk-' + this.componentId;
            }
            return 'cxas-modal-' + (this.resourceOrthancId || this.componentId);
        },
        isBulkMode() {
            return this.resourceLevel === 'bulk';
        },
        orthancStudyId() {
            if (this.resourceLevel === 'study' && !this.isBulkMode) {
                return this.resourceOrthancId;
            }
            return null;
        },
        orthancSeriesId() {
            if (this.resourceLevel === 'series' && !this.isBulkMode) {
                return this.resourceOrthancId;
            }
            return null;
        },
        orthancInstanceId() {
            if (this.resourceLevel === 'instance' && !this.isBulkMode) {
                return this.resourceOrthancId;
            }
            return null;
        }
    },
    methods: {
        isBulkButtonEnabled() {
            return this.selectedStudiesIds.length > 0;
        }
    },
    components: { CXASModal }
}
</script>

<template>
    <div v-if="hasCXASButton" class="custom-button-group">
        <button class="btn btn-sm btn-secondary m-1" type="button" data-bs-toggle="modal"
            v-bind:data-bs-target="'#' + modalId" :disabled="isBulkMode && !isBulkButtonEnabled()"
            :class="buttonClasses">
            <span data-bs-toggle="tooltip" title="CXAS Segmentation" style="font-size: 0.8rem;">CXAS</span>
        </button>
        <CXASModal :id="modalId" :orthancStudyId="orthancStudyId" :orthancSeriesId="orthancSeriesId"
            :orthancInstanceId="orthancInstanceId" :isBulkMode="isBulkMode"
            :selectedStudiesIds="isBulkMode ? selectedStudiesIds : []" />
    </div>
</template>

<style scoped>
.custom-button-group {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0.25rem;
}
</style>
