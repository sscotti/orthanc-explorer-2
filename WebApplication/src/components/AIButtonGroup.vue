<script>
import { mapState } from "vuex"
import CXASModal from "./CXASModal.vue"
import SourceType from "../helpers/source-type"

export default {
    props: ["resourceOrthancId", "resourceDicomUid", "resourceLevel", "customClass", "smallIcons"],
    data() {
        return {
            componentId: Math.random().toString(36).substring(7)
        };
    },
    computed: {
        ...mapState({
            uiOptions: state => state.configuration.uiOptions,
            cxasOptions: state => state.configuration.uiOptions.CXAS || {},
            studiesSourceType: state => state.studies.sourceType,
            selectedStudiesIds: state => state.studies.selectedStudiesIds
        }),
        hasCXASButton() {
            // Check if CXAS is enabled
            if (!this.uiOptions) {
                return true; // Show by default if config not loaded
            }

            // Check if CXAS configuration exists in uiOptions
            if (!this.uiOptions.CXAS || Object.keys(this.cxasOptions).length === 0) {
                // If CXAS config doesn't exist, check if EnableAI is true (fallback)
                if (this.uiOptions.EnableAI !== false) {
                    return true; // Show by default if EnableAI is not explicitly false
                }
                return false;
            }

            if (this.cxasOptions.EnableCXAS === false) {
                return false;
            }

            // Check if current resource level is allowed in Levels configuration
            const allowedLevels = this.cxasOptions.Levels;
            console.log("allowedLevels", allowedLevels);
            if (allowedLevels && Array.isArray(allowedLevels) && allowedLevels.length > 0) {
                // Check if current resourceLevel is in the allowed levels
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
