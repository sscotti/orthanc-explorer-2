<script>
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
            processingFeatures: false,
            errorMessage: null,
            successMessage: null,
            extractedFeatures: null, // Store extracted features to display
            // CXAS config loaded from API
            cxasConfig: null
        }
    },
    computed: {
        isEnabled() {
            return this.cxasConfig?.EnableCXAS !== false;
        },
        // Get available classes from configuration (default to [141, 142, 143, 145, 146, 147])
        availableClasses() {
            if (this.cxasConfig?.AvailableClasses && Array.isArray(this.cxasConfig.AvailableClasses)) {
                return this.cxasConfig.AvailableClasses;
            }
            // Default classes if not configured
            return [141, 142, 143, 145, 146, 147];
        },
        // Get default enabled classes from configuration
        defaultEnabledClasses() {
            if (this.cxasConfig?.DefaultEnabledClasses && Array.isArray(this.cxasConfig.DefaultEnabledClasses)) {
                return this.cxasConfig.DefaultEnabledClasses;
            }
            // Default: enable all available classes
            return this.availableClasses;
        },
        // Get enabled features from configuration
        enabledFeatures() {
            if (this.cxasConfig?.Features && typeof this.cxasConfig.Features === 'object') {
                // Return list of features where value is true
                return Object.keys(this.cxasConfig.Features).filter(f => this.cxasConfig.Features[f] === true);
            }
            // Default features if not configured
            return ['CTR', 'SCD'];
        },
    },
    async mounted() {
        // Load CXAS config from API
        try {
            this.cxasConfig = await cxasApi.getConfig();
        } catch (error) {
            console.warn("Failed to load CXAS config:", error);
        }

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
            this.processingFeatures = false;
            this.extractingFeatures = false;
            this.errorMessage = null;
            this.successMessage = null;
            this.extractedFeatures = null;
            // Reset to default values from configuration
            this.selectedClasses = [...this.defaultEnabledClasses];
            if (this.cxasConfig?.DefaultOutputFormat) {
                this.outputFormat = this.cxasConfig.DefaultOutputFormat;
            }
            if (this.cxasConfig?.DefaultStoreSegmentation !== undefined) {
                this.storeSegmentation = this.cxasConfig.DefaultStoreSegmentation;
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
            if (this.cxasConfig?.ClassLabels && this.cxasConfig.ClassLabels[classIndex]) {
                return this.cxasConfig.ClassLabels[classIndex];
            }
            return getClassName(classIndex);
        },
        async runSegmentation() {
            this.processing = true;
            this.errorMessage = null;

            try {
                // Handle bulk mode vs single resource
                let payload = null;
                let resourceId = null;
                let resourceLevel = null;

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
                    this.messageBus.emit('show-toast', 'CXAS segmentation completed successfully');

                    // If extracting features is enabled, do that too (only for instance-level, single resource)
                    if (this.extractingFeatures && resourceId && resourceLevel === 'instance') {
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
                this.messageBus.emit('show-toast', this.errorMessage);
            } finally {
                this.processing = false;
            }
        },
        async runFeatureExtraction() {
            this.processingFeatures = true;
            this.errorMessage = null;

            try {
                // Feature extraction only works on instance level
                let resourceId = null;
                let resourceLevel = null;

                if (this.orthancInstanceId) {
                    resourceId = this.orthancInstanceId;
                    resourceLevel = 'instance';
                } else {
                    throw new Error('Feature extraction only supports instance-level resources');
                }

                await this.extractFeatures(resourceId, resourceLevel);

                // Don't close modal automatically - let user see the results and close manually
                // The results are displayed in the modal via extractedFeatures and successMessage
            } catch (error) {
                console.error('CXAS feature extraction error:', error);
                this.errorMessage = error.response?.data?.error || error.response?.data?.Message || error.message || 'Feature extraction failed';
                this.messageBus.emit('show-toast', this.errorMessage);
            } finally {
                this.processingFeatures = false;
            }
        },
        async extractFeatures(resourceId, resourceLevel) {
            try {
                const payload = {
                    [resourceLevel.charAt(0).toUpperCase() + resourceLevel.slice(1)]: resourceId,
                    Features: this.enabledFeatures // Use enabled features from config
                };

                const response = await cxasApi.extractFeatures(payload);
                if (response.data && response.data.Success) {
                    // Store extracted features to display in modal
                    this.extractedFeatures = response.data.Features || null;
                    
                    // Format and display feature results
                    let message = 'Feature extraction completed';
                    if (response.data.Features && Object.keys(response.data.Features).length > 0) {
                        const featureStrings = Object.entries(response.data.Features).map(([key, value]) => {
                            // Format numeric values to 2-3 decimal places
                            const numValue = parseFloat(value);
                            const formattedValue = isNaN(numValue) ? value : numValue.toFixed(3);
                            return `${key}: ${formattedValue}`;
                        });
                        message += ` - ${featureStrings.join(', ')}`;
                    }
                    
                    this.successMessage = message;
                    this.messageBus.emit('show-toast', message);
                    
                    // Log extracted features for debugging
                    if (response.data.Features) {
                        console.log('Extracted features:', response.data.Features);
                    }
                } else {
                    throw new Error(response.data?.error || response.data?.Message || 'Feature extraction failed');
                }
            } catch (error) {
                console.error('Feature extraction error:', error);
                throw error; // Re-throw to let caller handle it
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
                                id="cxas-features" :disabled="processing || !orthancInstanceId">
                            <label class="form-check-label" for="cxas-features">
                                Extract features after segmentation ({{ enabledFeatures.join(', ') }})
                            </label>
                            <small v-if="!orthancInstanceId" class="form-text text-muted d-block">
                                Note: Feature extraction only works on instance-level resources
                            </small>
                        </div>
                    </div>

                    <!-- Feature Extraction Results -->
                    <div v-if="extractedFeatures && Object.keys(extractedFeatures).length > 0" 
                        class="mt-4 pt-3 border-top">
                        <h6 class="mb-3">
                            <i class="bi bi-clipboard-data"></i> Extracted Features
                        </h6>
                        <div class="table-responsive">
                            <table class="table table-sm table-bordered">
                                <thead>
                                    <tr>
                                        <th>Feature</th>
                                        <th>Value</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="(value, key) in extractedFeatures" :key="key">
                                        <td><strong>{{ key }}</strong></td>
                                        <td>{{ parseFloat(value).toFixed(3) }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <small class="text-muted">
                            <i class="bi bi-info-circle"></i> 
                            Results are displayed for reference. PDF/DICOM report export coming soon.
                        </small>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal"
                        :disabled="processing">Cancel</button>
                    <button v-if="orthancInstanceId" type="button" class="btn btn-info me-2" 
                        @click="runFeatureExtraction" :disabled="processing || processingFeatures">
                        <span v-if="processingFeatures" class="spinner-border spinner-border-sm me-2" role="status"
                            aria-hidden="true"></span>
                        {{ processingFeatures ? 'Processing...' : 'Extract Features Only' }}
                    </button>
                    <button type="button" class="btn btn-primary" @click="runSegmentation" :disabled="processing || processingFeatures">
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
