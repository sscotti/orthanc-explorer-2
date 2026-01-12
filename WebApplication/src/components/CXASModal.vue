<script>
import { mapState } from "vuex"
import cxasApi from "../api/cxasApi"
import { getClassName, getEnabledClasses } from "../helpers/cxas-classes"
import bootstrap from "bootstrap/dist/js/bootstrap.bundle.min.js"

export default {
    props: ["id", "orthancStudyId", "orthancSeriesId", "orthancInstanceId", "isBulkMode", "selectedStudiesIds"],
    data() {
        return {
            // Selected class indices (e.g., [141, 142, 143, 145, 146, 147])
            selectedClasses: [],
            outputFormat: "png", // png, json, npy, dicom-seg
            storeSegmentation: true,
            extractingFeatures: false,
            processing: false,
            errorMessage: null
        }
    },
    computed: {
        ...mapState({
            uiOptions: state => state.configuration.uiOptions,
            cxasOptions: state => state.configuration.uiOptions.CXAS || {}
        }),
        isEnabled() {
            return this.cxasOptions.EnableCXAS !== false;
        },
        // Get available classes from configuration (default to [141, 142, 143, 145, 146, 147])
        availableClasses() {
            if (this.cxasOptions.AvailableClasses && Array.isArray(this.cxasOptions.AvailableClasses)) {
                return this.cxasOptions.AvailableClasses;
            }
            // Default classes if not configured
            return [141, 142, 143, 145, 146, 147];
        },
        // Get default enabled classes from configuration
        defaultEnabledClasses() {
            if (this.cxasOptions.DefaultEnabledClasses && Array.isArray(this.cxasOptions.DefaultEnabledClasses)) {
                return this.cxasOptions.DefaultEnabledClasses;
            }
            // Default: enable all available classes
            return this.availableClasses;
        },
    },
    mounted() {
        // Initialize selected classes from configuration
        this.selectedClasses = [...this.defaultEnabledClasses];

        this.$refs['modal-main-div']?.addEventListener('show.bs.modal', (e) => {
            // move the modal to body to avoid z-index issues
            document.querySelector('body')?.appendChild(e.target);
            this.reset();
        });
    },
    methods: {
        reset() {
            this.processing = false;
            this.extractingFeatures = false;
            this.errorMessage = null;
            // Reset to default values from configuration
            this.selectedClasses = [...this.defaultEnabledClasses];
            if (this.cxasOptions.DefaultOutputFormat) {
                this.outputFormat = this.cxasOptions.DefaultOutputFormat;
            }
            if (this.cxasOptions.DefaultStoreSegmentation !== undefined) {
                this.storeSegmentation = this.cxasOptions.DefaultStoreSegmentation;
            }
        },
        toggleClass(classIndex) {
            const index = this.selectedClasses.indexOf(classIndex);
            if (index > -1) {
                this.selectedClasses.splice(index, 1);
            } else {
                this.selectedClasses.push(classIndex);
            }
        },
        isClassSelected(classIndex) {
            return this.selectedClasses.includes(classIndex);
        },
        getClassLabel(classIndex) {
            // Get class label from configuration or helper
            if (this.cxasOptions.ClassLabels && this.cxasOptions.ClassLabels[classIndex]) {
                return this.cxasOptions.ClassLabels[classIndex];
            }
            return getClassName(classIndex);
        },
        async runSegmentation() {
            this.processing = true;
            this.errorMessage = null;

            try {
                // Handle bulk mode vs single resource
                let payload = null;

                if (this.isBulkMode && this.selectedStudiesIds && this.selectedStudiesIds.length > 0) {
                    // Bulk mode: process multiple studies
                    payload = {
                        Studies: this.selectedStudiesIds,
                        Options: {
                            Classes: this.selectedClasses, // Array of class indices
                            OutputFormat: this.outputFormat,
                            StoreSegmentation: this.storeSegmentation
                        }
                    };
                } else {
                    // Single resource mode
                    let resourceId = null;
                    let resourceLevel = null;

                    if (this.orthancInstanceId) {
                        resourceId = this.orthancInstanceId;
                        resourceLevel = 'instance';
                    } else if (this.orthancSeriesId) {
                        resourceId = this.orthancSeriesId;
                        resourceLevel = 'series';
                    } else if (this.orthancStudyId) {
                        resourceId = this.orthancStudyId;
                        resourceLevel = 'study';
                    } else {
                        throw new Error('No resource ID provided');
                    }

                    // Prepare request payload
                    payload = {
                        [resourceLevel.charAt(0).toUpperCase() + resourceLevel.slice(1)]: resourceId,
                        Options: {
                            Classes: this.selectedClasses, // Array of class indices
                            OutputFormat: this.outputFormat,
                            StoreSegmentation: this.storeSegmentation
                        }
                    };
                }

                // Call CXAS API endpoint
                const response = await cxasApi.segment(payload);

                // Handle response
                if (response.data && response.data.Success) {
                    this.messageBus.emit('toast', {
                        type: 'success',
                        message: 'CXAS segmentation completed successfully'
                    });

                    // If extracting features is enabled, do that too
                    if (this.extractingFeatures) {
                        await this.extractFeatures(resourceId, resourceLevel);
                    }

                    // Close modal
                    const modalElement = document.getElementById(this.id);
                    if (modalElement) {
                        const modal = bootstrap.Modal.getInstance(modalElement);
                        if (modal) {
                            modal.hide();
                        }
                    }
                } else {
                    throw new Error(response.data?.Message || 'Segmentation failed');
                }
            } catch (error) {
                console.error('CXAS segmentation error:', error);
                this.errorMessage = error.response?.data?.Message || error.message || 'Segmentation failed';
                this.messageBus.emit('toast', {
                    type: 'error',
                    message: this.errorMessage
                });
            } finally {
                this.processing = false;
            }
        },
        async extractFeatures(resourceId, resourceLevel) {
            try {
                const payload = {
                    [resourceLevel.charAt(0).toUpperCase() + resourceLevel.slice(1)]: resourceId,
                    Features: ['CTR', 'SCD'] // Cardio-Thoracic Ratio, Spine-Center Distance
                };

                const response = await cxasApi.extractFeatures(payload);
                if (response.data && response.data.Success) {
                    this.messageBus.emit('toast', {
                        type: 'success',
                        message: 'Feature extraction completed'
                    });
                }
            } catch (error) {
                console.error('Feature extraction error:', error);
                // Don't fail the whole operation if feature extraction fails
            }
        },
        closeModal() {
            const modalElement = document.getElementById(this.id);
            if (modalElement) {
                const modal = bootstrap.Modal.getInstance(modalElement);
                if (modal) {
                    modal.hide();
                }
            }
        }
    }
}
</script>

<template>
    <div class="modal fade" :id="this.id" tabindex="-1" aria-labelledby="cxasModalLabel" ref="modal-main-div">
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="cxasModalLabel">CXAS Segmentation</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <div v-if="errorMessage" class="alert alert-danger" role="alert">
                        <i class="bi bi-exclamation-triangle-fill"></i> {{ errorMessage }}
                    </div>

                    <div v-if="isBulkMode && selectedStudiesIds" class="alert alert-info mb-3" role="alert">
                        <i class="bi bi-info-circle-fill"></i>
                        Processing {{ selectedStudiesIds.length }} selected {{ selectedStudiesIds.length === 1 ? 'study'
                            : 'studies' }}.
                    </div>

                    <div class="mb-3">
                        <h6>Segmentation Classes</h6>
                        <p class="text-muted small">Select anatomical structures to segment</p>
                        <div v-for="classIndex in availableClasses" :key="classIndex" class="form-check">
                            <input class="form-check-input" type="checkbox" :id="'cxas-class-' + classIndex"
                                :checked="isClassSelected(classIndex)" @change="toggleClass(classIndex)"
                                :disabled="processing">
                            <label class="form-check-label" :for="'cxas-class-' + classIndex">
                                {{ getClassLabel(classIndex) }}
                                <span class="text-muted small"> ({{ classIndex }})</span>
                            </label>
                        </div>
                    </div>

                    <div class="mb-3">
                        <label for="cxas-output-format" class="form-label">Output Format</label>
                        <select class="form-select" id="cxas-output-format" v-model="outputFormat"
                            :disabled="processing">
                            <option value="png">PNG</option>
                            <option value="json">JSON</option>
                            <option value="npy">NPY</option>
                            <option value="dicom-seg">DICOM-SEG</option>
                        </select>
                    </div>

                    <div class="mb-3">
                        <div class="form-check">
                            <input class="form-check-input" type="checkbox" v-model="storeSegmentation" id="cxas-store"
                                :disabled="processing">
                            <label class="form-check-label" for="cxas-store">
                                Store segmentation in Orthanc
                            </label>
                        </div>
                    </div>

                    <div class="mb-3">
                        <div class="form-check">
                            <input class="form-check-input" type="checkbox" v-model="extractingFeatures"
                                id="cxas-features" :disabled="processing">
                            <label class="form-check-label" for="cxas-features">
                                Extract features (CTR, SCD)
                            </label>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal"
                        :disabled="processing">Cancel</button>
                    <button type="button" class="btn btn-primary" @click="runSegmentation" :disabled="processing">
                        <span v-if="processing" class="spinner-border spinner-border-sm me-2" role="status"
                            aria-hidden="true"></span>
                        {{ processing ? 'Processing...' : 'Run Segmentation' }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.form-check {
    margin-bottom: 0.5rem;
}

.form-check-label {
    margin-left: 0.5rem;
}
</style>
