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
            // Show button for all resource levels (study, series, instance, bulk)
            // Backend will validate and handle invalid requests appropriately
            // Default to true if config not loaded yet, or if EnableCXAS is not explicitly false
            if (!this.uiOptions || !this.cxasOptions) {
                return true; // Show by default if config not loaded
            }
            return this.cxasOptions.EnableCXAS !== false;
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
            <i class="fa fa-brain" data-bs-toggle="tooltip" title="CXAS Segmentation"></i>
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
