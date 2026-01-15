<script>
import StudyItem from "./StudyItem.vue"
import ResourceButtonGroup from "./ResourceButtonGroup.vue"
import LabelsEditor from "./LabelsEditor.vue"
import Toasts from "./Toasts.vue"

import { mapState, mapGetters } from "vuex"
import { baseOe2Url } from "../globalConfigurations"
import { translateDicomTag } from "../locales/i18n"
import dateHelpers from "../helpers/date-helpers"
import $ from "jquery"
import { endOfMonth, endOfYear, startOfMonth, startOfYear, subMonths, subDays, startOfWeek, endOfWeek, subYears } from 'date-fns';
import api from "../orthancApi";
import SourceType from "../helpers/source-type";
import { nextTick } from 'vue'
import Datepicker from '@vuepic/vue-datepicker';
import '@vuepic/vue-datepicker/dist/main.css';

const Status = Object.freeze({
    UNDEFINED: 0,
    LOADING_MOST_RECENT_STUDIES: 1,
    DISPLAYING_MOST_RECENT_STUDIES: 2,
    DISPLAYING_FILTERED_STUDIES: 3,
});

export default {
    props: [],
    emits: ['deletedStudy'],
    data() {
        return {
            filterStudyDate: '',
            filterStudyDateForDatePicker: '',
            filterPatientBirthDate: '',
            filterPatientBirthDateForDatePicker: '',
            filterModalities: {},
            filterGenericTags: {},
            oldFilterGenericTags: {},
            filterLabels: [],
            currentOrderByTag: null,
            currentOrderDirection: 'ASC',
            filterOrderBy: [{ 'Type': 'Metadata', 'Key': 'LastUpdate', 'Direction': 'DESC' }],
            allModalities: true,
            noneModalities: false,
            updatingFilterUi: false,
            updatingRouteWithoutReload: false,
            initializingModalityFilter: false,
            searchTimerHandler: {},
            columns: document._studyColumns,
            datePickerPresetRanges: document._datePickerPresetRanges,
            allSelected: false,
            isPartialSelected: false,
            mostRecentStudiesIds: [],
            shouldStopLoadingMostRecentStudies: false,
            status: Status.UNDEFINED,
            sourceType: SourceType.LOCAL_ORTHANC,
            remoteSource: null,
            showMultiLabelsFilter: false,
            multiLabelsFilterLabelsConstraint: "All",
            multiLabelsComponentKey: 0,
        };
    },
    computed: {
        ...mapState({
            uiOptions: state => state.configuration.uiOptions,
            allLabels: state => state.labels.allLabels,
            isConfigurationLoaded: state => state.configuration.loaded,
            studiesIds: state => state.studies.studiesIds,
            selectedStudiesIds: state => state.studies.selectedStudiesIds,
            isSearching: state => state.studies.isSearching,
            statistics: state => state.studies.statistics,
            hasExtendedFind: state => state.configuration.hasExtendedFind,
            hasExtendedChanges: state => state.configuration.hasExtendedChanges
        }),
        ...mapGetters([
            'studies/isFilterEmpty',
            'studies/isMostRecentOrdering',
        ]),
        selectedStudiesCount() {
            if (this.selectedStudiesIds.length > 0) {
                return this.selectedStudiesIds.length;
            } else {
                return "";
            }
        },
        colSpanBeforeMultiLabelsFilter() {
            let span = 1;
            if (this.hasPrimaryViewerIcon) {
                span++;
            }
            if (this.hasPdfReportIcon) {
                span++;
            }
            return span;
        },
        colSpanMultiLabelsFilter() {
            if (this.uiOptions && this.uiOptions.StudyListColumns) {
                let totalColumnsCount = this.uiOptions.StudyListColumns.length + 1;
                if (this.hasPrimaryViewerIcon) {
                    totalColumnsCount++;
                }
                if (this.hasPdfReportIcon) {
                    totalColumnsCount++;
                }
                return totalColumnsCount - this.colSpanBeforeMultiLabelsFilter - this.colSpanAfterMultiLabelsFilter;
            } else {
                return 4;
            }
        },
        colSpanAfterMultiLabelsFilter() {
            return 3;
        },
        widthColum1() {
            if (this.colSpanClearFilter == 1) {
                return "4%";
            } else {
                return "2%";
            }
        },
        colSpanClearFilter() {
            if (this.sourceType != SourceType.LOCAL_ORTHANC) {
                return 1;
            }
            let span = 1;
            if (this.hasPrimaryViewerIcon) {
                span++;
            }
            if (this.hasPdfReportIcon) {
                span++;
            }
            return span;
        },
        hasPrimaryViewerIcon() {
            return this.sourceType == SourceType.LOCAL_ORTHANC && this.uiOptions.EnableViewerQuickButton;
        },
        hasPdfReportIcon() {
            return this.sourceType == SourceType.LOCAL_ORTHANC && this.uiOptions.EnableReportQuickButton;
        },
        isDarkMode() {
            let bootstrapTheme = document.documentElement.getAttribute("data-bs-theme");
            bootstrapTheme = getComputedStyle(document.documentElement).getPropertyValue('--bootstrap-theme');
            return bootstrapTheme == "dark";
        },
        datePickerFormat() {
            return this.uiOptions.DateFormat;
        },
        isDisplayingMostRecentStudies() {
            return this.status == Status.DISPLAYING_MOST_RECENT_STUDIES;
        },
        isLoadingMostRecentStudies() {
            return this.status == Status.LOADING_MOST_RECENT_STUDIES;
        },
        isStudyListEmpty() {
            return this.studiesIds.length == 0;
        },
        isSearchAsYouTypeEnabled() {
            if (this.sourceType == SourceType.LOCAL_ORTHANC) {
                return this.uiOptions.StudyListSearchMode == "search-as-you-type";
            } else {
                return false;
            }
        },
        isSearchButtonEnabled() {
            if (this.sourceType == SourceType.LOCAL_ORTHANC) {
                return this.uiOptions.StudyListSearchMode == "search-button";
            } else {
                return true;
            }
        },
        showEmptyStudyListIfNoSearch() {
            if (this.sourceType == SourceType.LOCAL_ORTHANC) {
                return this.uiOptions.StudyListContentIfNoSearch == "empty";
            } else {
                return true;
            }
        },
    },
    watch: {
        '$route': async function () {
            if (!this.updatingRouteWithoutReload) {
                this.updateFilterFromRoute(this.$route.query);
            }
        },
        isConfigurationLoaded(newValue, oldValue) {
            this.initModalityFilter();
            for (const tag of this.uiOptions.StudyListColumns) {
                if (['StudyDate', 'PatientBirthDate', 'modalities', 'seriesCount', 'instancesCount', 'seriesAndInstancesCount'].indexOf(tag) == -1) {
                    this.filterGenericTags[tag] = '';
                }
            }
            this.updateFilterFromRoute(this.$route.query);
            setTimeout(() => { this.showMultiLabelsFilter = true }, 300);
        },
        filterModalities: {
            handler(newValue, oldValue) {
                if (!this.updatingFilterUi && !this.initializingModalityFilter) {
                    if (this.isSearchAsYouTypeEnabled) {
                        this.updateFilter('ModalitiesInStudy', this.getModalityFilter(), null);
                    } else {
                        this.getModalityFilter();
                    }
                }
            },
            deep: true
        },
        filterGenericTags: {
            handler(newValue, oldValue) {
                for (const [k, v] of Object.entries(this.filterGenericTags)) {
                    let oldValue = null;
                    if (k in this.oldFilterGenericTags) {
                        oldValue = this.oldFilterGenericTags[k]
                    }
                    this.updateFilter(k, v, oldValue);
                    this.oldFilterGenericTags[k] = v;
                }
            },
            deep: true
        },
        filterStudyDate(newValue, oldValue) {
            this.updateFilter('StudyDate', newValue, oldValue);
        },
        filterStudyDateForDatePicker(newValue, oldValue) {
            let dicomNewValue = dateHelpers.dicomDateFromDatePicker(newValue);
            if (dicomNewValue == null) {
                dicomNewValue = "";
            }
            this.filterStudyDate = dicomNewValue;
        },
        filterPatientBirthDate(newValue, oldValue) {
            this.updateFilter('PatientBirthDate', newValue, oldValue);
        },
        filterPatientBirthDateForDatePicker(newValue, oldValue) {
            let dicomNewValue = dateHelpers.dicomDateFromDatePicker(newValue);
            if (dicomNewValue == null) {
                dicomNewValue = "";
            }
            this.filterPatientBirthDate = dicomNewValue;
        },
        selectedStudiesIds: {
            handler(oldValue, newValue) {
                this.updateSelectAll();
            },
            deep: true
        },
    },
    async created() {
        this.messageBus.on('language-changed', this.translateDatePicker);
        this.messageBus.on('filter-label-changed', this.filterLabelChanged);
        if (this.isConfigurationLoaded) {
            setTimeout(() => { this.showMultiLabelsFilter = true }, 300);
        }
    },
    async mounted() {
        this.updateSelectAll();
        // Auto-load studies if none are loaded
        if (this.studiesIds.length === 0 && this.isConfigurationLoaded) {
            await this.reloadStudyList();
        }
    },
    watch: {
        // Watch for configuration to load, then load studies
        isConfigurationLoaded: {
            immediate: true,
            async handler(loaded) {
                if (loaded && this.studiesIds.length === 0) {
                    await this.reloadStudyList();
                }
            }
        }
    },
    methods: {
        updateSelectAll() {
            if (this.selectedStudiesIds.length == 0) {
                this.allSelected = false;
                this.isPartialSelected = false;
            } else if (this.selectedStudiesIds.length == this.studiesIds.length) {
                this.allSelected = true;
                this.isPartialSelected = false;
            } else {
                this.allSelected = '';
                this.isPartialSelected = true;
            }
        },
        clickSelectAll() {
            if (this.allSelected == '' || !this.allSelected) {
                this.$store.dispatch('studies/selectAllStudies', { isSelected: true });
                this.messageBus.emit('selected-all');
            } else {
                this.$store.dispatch('studies/selectAllStudies', { isSelected: false });
                this.messageBus.emit('unselected-all')
            }
        },
        translateDatePicker(languageKey) {
            for (let i in document._datePickerPresetRanges) {
                document._datePickerPresetRanges[i].label = this.$t(document._datePickerPresetRanges[i].tLabel);
            }
        },
        filterLabelChanged(label) {
            this.filterLabels = [label];
            this.multiLabelsFilterLabelsConstraint = "All";
            this.multiLabelsComponentKey++;
            this.search();
        },
        initModalityFilter() {
            this.initializingModalityFilter = true;
            this.filterModalities = {};
            for (const modality of this.uiOptions.ModalitiesFilter) {
                this.filterModalities[modality] = true;
            }
            this.initializingModalityFilter = false;
        },
        async updateFilterFromRoute(filters) {
            this.updatingFilterUi = true;
            await this.$store.dispatch('studies/clearStudies');
            await this.$store.dispatch('studies/clearFilterNoReload');
            var keyValueFilters = {};

            if ("source-type" in filters && "remote-source" in filters) {
                if (filters["source-type"].toLowerCase() === "dicom") {
                    this.sourceType = SourceType.REMOTE_DICOM;
                } else if (filters["source-type"].toLowerCase() === "dicom-web") {
                    this.sourceType = SourceType.REMOTE_DICOM_WEB;
                }
                this.remoteSource = filters["remote-source"];
            } else {
                this.sourceType = SourceType.LOCAL_ORTHANC;
                this.remoteSource = null;
            }
            await this.$store.dispatch('studies/updateSource', { 'source-type': this.sourceType, 'remote-source': this.remoteSource });

            let labelsConstraint = filters["labels-constraint"] || 'All';
            for (const [filterKey, filterValue] of Object.entries(filters)) {
                if (filterKey == "labels") {
                    const labels = filterValue.split(",");
                    keyValueFilters[filterKey] = labels;
                    await this.$store.dispatch('studies/updateLabelFilterNoReload', { labels: labels, constraint: labelsConstraint });
                } else if (filterKey == 'labels-constraint') {
                    this.multiLabelsFilterLabelsConstraint = filterValue;
                } else if (filterKey[0] === filterKey[0].toUpperCase()) {
                    keyValueFilters[filterKey] = filterValue;
                    await this.$store.dispatch('studies/updateFilterNoReload', { dicomTagName: filterKey, value: filterValue });
                }
            }

            await this.updateFilterForm(keyValueFilters, labelsConstraint);

            if (this.sourceType == SourceType.LOCAL_ORTHANC || !this['studies/isFilterEmpty']) {
                await this.reloadStudyList();
            }

            this.multiLabelsComponentKey++;
            await nextTick();
            this.updatingFilterUi = false;
        },
        updateFilterForm(filters, labelsConstraint) {
            this.emptyFilterForm();
            this.multiLabelsFilterLabelsConstraint = labelsConstraint;
            for (const [key, value] of Object.entries(filters)) {
                if (key == "labels") {
                    this.filterLabels = value;
                } else if (key == "StudyDate") {
                    this.filterStudyDate = value;
                    this.filterStudyDateForDatePicker = dateHelpers.parseDateForDatePicker(value);
                } else if (key == "PatientBirthDate") {
                    this.filterPatientBirthDate = value;
                    this.filterPatientBirthDateForDatePicker = dateHelpers.parseDateForDatePicker(value);
                } else if (key == "ModalitiesInStudy") {
                    const modalities = value.split('\\');
                    if (modalities.length > 0) {
                        let allModalitiesInFilter = true;
                        let noneModalitiesInFilter = true;
                        for (const modality of this.uiOptions.ModalitiesFilter) {
                            const isInFilter = modalities.indexOf(modality) != -1
                            this.filterModalities[modality] = isInFilter;
                            allModalitiesInFilter &= isInFilter;
                            noneModalitiesInFilter &= !isInFilter;
                        }
                        this.allModalities = allModalitiesInFilter;
                        this.noneModalities = noneModalitiesInFilter;
                    }
                } else {
                    this.filterGenericTags[key] = value;
                }
            }
        },
        hasFilter(tagName) {
            return ['seriesCount', 'instancesCount', 'seriesAndInstancesCount'].indexOf(tagName) == -1;
        },
        getFilterPlaceholder(tagName) {
            if (tagName in this.columns && this.columns[tagName].placeholder) {
                return this.columns[tagName].placeholder;
            } else {
                return "search-text";
            }
        },
        getFilterClass(tagName) {
            const value = this.getFilterValue(tagName);
            if (value != null && value.length > 0 && !this.isFilterLongEnough(tagName, value)) {
                return "is-invalid-filter";
            }
            return "";
        },
        isFilterLongEnough(tagName, value) {
            return value.length >= this.getMinimalFilterLength(tagName);
        },
        updateFilter(dicomTagName, newValue, oldValue) {
            if (this.updatingFilterUi) {
                return;
            }

            if (!this.isSearchAsYouTypeEnabled) {
                return;
            }

            if (dicomTagName == "ModalitiesInStudy" && oldValue == null) {
                this._updateFilter(dicomTagName, newValue);
                return;
            }

            if (newValue.length >= this.uiOptions.StudyListSearchAsYouTypeMinChars) {
                if (this.searchTimerHandler[dicomTagName]) {
                    clearTimeout(this.searchTimerHandler[dicomTagName]);
                }
                this.searchTimerHandler[dicomTagName] = setTimeout(() => { this._updateFilter(dicomTagName, newValue) }, this.uiOptions.StudyListSearchAsYouTypeDelay);
            } else if (oldValue && newValue.length < oldValue.length && oldValue.length >= this.uiOptions.StudyListSearchAsYouTypeMinChars) {
                this.searchTimerHandler[dicomTagName] = setTimeout(() => { this._updateFilter(dicomTagName, "") }, this.uiOptions.StudyListSearchAsYouTypeDelay);
            }
        },
        _updateFilter(dicomTagName, value) {
            this.searchTimerHandler[dicomTagName] = null;
            this.$store.dispatch('studies/updateFilterNoReload', { dicomTagName: dicomTagName, value: value });
            this.updateUrlNoReload();
            this.reloadStudyList();
        },
        async updateUrlNoReload() {
            this.updatingRouteWithoutReload = true;
            await this.updateUrl();
            this.updatingRouteWithoutReload = false;
        },
        getMinimalFilterLength(tagName) {
            if (["AccessionNumber", "PatientName", "PatientID", "StudyDescription"].indexOf(tagName) != -1) {
                if (this.isSearchAsYouTypeEnabled) {
                    return this.uiOptions.StudyListSearchAsYouTypeMinChars;
                }
            } else if (["PatientBirthDate", "StudyDate"].indexOf(tagName) != -1) {
                return 8;
            }
            return 0;
        },
        getFilterValue(tagName) {
            if (!this.isConfigurationLoaded) {
                return null;
            }
            if (tagName == "StudyDate") {
                return this.filterStudyDate;
            } else if (tagName == "PatientBirthDate") {
                return this.filterPatientBirthDate;
            } else {
                return this.filterGenericTags[tagName];
            }
        },
        getModalityFilter() {
            if (this.filterModalities === undefined) {
                return "";
            }

            let modalityFilter = "";
            let allSelected = true;
            let selected = [];

            for (const [key, value] of Object.entries(this.filterModalities)) {
                allSelected &= value;
                if (value) {
                    selected.push(key);
                }
            }
            if (allSelected) {
                this.allModalities = true;
                this.noneModalities = false;
                return "";
            } else if (selected.length == 0) {
                this.allModalities = false;
                this.noneModalities = true;
                return "NONE";
            } else {
                this.allModalities = false;
                this.noneModalities = false;
                return selected.join('\\');
            }
        },
        async clearFilters() {
            await this.clearFiltersUi();
            await this.$store.dispatch('studies/clearFilterNoReload');

            if (this.sourceType == SourceType.LOCAL_ORTHANC) {
                this.reloadStudyList();
            }
        },
        async clearFiltersUi() {
            this.updatingFilterUi = true;
            this.emptyFilterForm();
            this.updateUrl();
            await nextTick();
            this.updatingFilterUi = false;
        },
        emptyFilterForm() {
            this.filterStudyDate = '';
            this.filterStudyDateForDatePicker = null;
            this.filterPatientBirthDate = '';
            this.filterPatientBirthDateForDatePicker = null;
            this.filterGenericTags = {};
            if (this.uiOptions.StudyListColumns) {
                for (const tag of this.uiOptions.StudyListColumns) {
                    if (['StudyDate', 'PatientBirthDate', 'modalities', 'seriesCount', 'instancesCount', 'seriesAndInstancesCount'].indexOf(tag) == -1) {
                        this.filterGenericTags[tag] = '';
                    }
                }
            }
            this.filterLabels = [];
            this.clearModalityFilter();
        },
        clearModalityFilter() {
            if (this.uiOptions.StudyListColumns) {
                for (const modality of this.uiOptions.ModalitiesFilter) {
                    this.filterModalities[modality] = true;
                }
            }
        },
        async toggleModalityFilter(ev) {
            const modality = ev.srcElement.getAttribute("data-value");
            let newValue = true;
            if (modality == "all") {
                newValue = true;
            } else if (modality == "none") {
                newValue = false;
            }

            for (const [key, value] of Object.entries(this.filterModalities)) {
                this.filterModalities[key] = newValue;
            }

            this.getModalityFilter();
        },
        modalityFilterClicked(ev) {
            ev.stopPropagation();
        },
        closeModalityFilter(ev) {
            $("#dropdown-modalities-button").click();
            ev.preventDefault();
            ev.stopPropagation();
        },
        async search() {
            if (this.isSearching) {
                await this.$store.dispatch('studies/cancelSearch');
            } else {
                // Update filters with the value of filter controls when we click the search button
                await this.$store.dispatch('studies/clearFilterNoReload');
                for (const tag of this.uiOptions.StudyListColumns) {
                    if (['modalities', 'seriesCount', 'instancesCount', 'seriesAndInstancesCount'].indexOf(tag) == -1) {
                        await this.$store.dispatch('studies/updateFilterNoReload', { dicomTagName: tag, value: this.getFilterValue(tag) });
                    }
                }
                await this.$store.dispatch('studies/updateFilterNoReload', { dicomTagName: "ModalitiesInStudy", value: this.getModalityFilter() });
                await this.$store.dispatch('studies/updateLabelFilterNoReload', { labels: this.filterLabels, constraint: this.multiLabelsFilterLabelsConstraint });
                await this.updateUrl();
                await this.reloadStudyList();
            }
        },
        async updateUrl() {
            let query = {};

            if (this.sourceType != SourceType.LOCAL_ORTHANC) {
                if (this.sourceType == SourceType.REMOTE_DICOM) {
                    query['source-type'] = 'dicom';
                } else if (this.sourceType == SourceType.REMOTE_DICOM_WEB) {
                    query['source-type'] = 'dicom-web';
                }
                query['remote-source'] = this.remoteSource;
            }

            if (this.filterStudyDate && this.filterStudyDate.length >= 8) {
                query['StudyDate'] = this.filterStudyDate;
            }
            if (this.filterPatientBirthDate && this.filterPatientBirthDate.length >= 8) {
                query['PatientBirthDate'] = this.filterPatientBirthDate;
            }
            if (this.getModalityFilter()) {
                query['ModalitiesInStudy'] = this.getModalityFilter();
            }
            for (const [k, v] of Object.entries(this.filterGenericTags)) {
                if (v && v.length > 0 && (v.length >= this.getMinimalFilterLength(k) || k == "ModalitiesInStudy")) {
                    query[k] = v;
                }
            }
            if (this.filterLabels.length > 0) {
                query['labels'] = this.filterLabels.join(',');
                if (this.multiLabelsFilterLabelsConstraint != 'All') {
                    query['labels-constraint'] = this.multiLabelsFilterLabelsConstraint;
                }
            }

            if (this.filterOrderBy.length > 0 && this.sourceType == SourceType.LOCAL_ORTHANC) {
                let orders = []
                for (let order of this.filterOrderBy) {
                    orders.push([order['Type'], order['Key'], order['Direction']].join(','))
                }
                query['order-by'] = orders.join(';');
            }

            let newUrl = "/filtered-studies?" + (new URLSearchParams(query)).toString();
            await this.$router.replace(newUrl);
        },
        async reloadStudyList() {
            if (this.sourceType == SourceType.LOCAL_ORTHANC && this.hasExtendedFind) {
                await this.$store.dispatch('studies/clearStudies');
                if (this['studies/isFilterEmpty']) {
                    if (this.uiOptions.StudyListContentIfNoSearch == "most-recents") {
                        const studies = await api.getMostRecentStudiesExtended(null);
                        for (const study of studies) {
                            this.$store.dispatch('studies/addStudy', { studyId: study["ID"], study: study, reloadStats: false });
                        }
                    }
                } else {
                    await this.$store.dispatch('studies/reloadFilteredStudies');
                }
            }
        },
        onDeletedStudy(studyId) {
            this.$store.dispatch('studies/deleteStudy', { studyId: studyId });
        },
        columnTitle(tagName) {
            if (tagName == "seriesCount") {
                return this.$i18n.t('series_count_header');
            } else if (tagName == "instancesCount") {
                return this.$i18n.t('instances_count_header');
            } else if (tagName == "seriesAndInstancesCount") {
                return this.$i18n.t('series_and_instances_count_header');
            } else if (tagName == "modalities") {
                return translateDicomTag(this.$i18n.t, this.$i18n.te, "ModalitiesInStudy");
            } else {
                return translateDicomTag(this.$i18n.t, this.$i18n.te, tagName);
            }
        },
    },
    components: { StudyItem, ResourceButtonGroup, LabelsEditor, Toasts, Datepicker }
}
</script>

<template>
    <div>
        <table class="table table-sm study-table table-borderless">
            <thead class="sticky-top">
                <tr class="study-column-titles">
                    <th :width="widthColum1" max-width="40px" scope="col"></th>
                    <th v-if="hasPrimaryViewerIcon" width="2%" max-width="30px" scope="col"></th>
                    <th v-if="hasPdfReportIcon" width="2%" max-width="30px" scope="col"></th>
                    <th v-for="columnTag in uiOptions.StudyListColumns" :key="columnTag"
                        v-bind:title="columnTitle(columnTag)" class="study-table-title">
                        <div class="title-container">
                            <div class="title-text">{{ columnTitle(columnTag) }}</div>
                        </div>
                    </th>
                </tr>
                <tr class="study-table-filters" v-on:keyup.enter="search">
                    <th scope="col" :colspan="colSpanClearFilter">
                        <button @click="clearFilters" type="button"
                            class="form-control study-list-filter btn filter-button btn-sm" data-bs-toggle="tooltip"
                            title="Clear filter">
                            <i class="fa-regular fa-circle-xmark"></i>
                        </button>
                    </th>
                    <th v-for="columnTag in uiOptions.StudyListColumns" :key="columnTag">
                        <div v-if="columnTag == 'StudyDate'">
                            <Datepicker v-if="columnTag == 'StudyDate'" v-model="filterStudyDateForDatePicker"
                                :enable-time-picker="false" range :preset-dates="datePickerPresetRanges"
                                :format="datePickerFormat" :preview-format="datePickerFormat" text-input
                                arrow-navigation hide-input-icon :highlight="{ weekdays: [6, 0] }" :dark="isDarkMode">
                                <template #yearly="{ label, range, presetDate }">
                                    <span @click="presetDate(range)">{{ label }}</span>
                                </template>
                            </Datepicker>
                        </div>
                        <div v-else-if="columnTag == 'modalities'" class="dropdown">
                            <button type="button" class="btn btn-default btn-sm filter-button dropdown-toggle"
                                data-bs-toggle="dropdown" id="dropdown-modalities-button" aria-expanded="false"><span
                                    class="fa fa-list"></span>&nbsp;<span class="caret"></span></button>
                            <ul class="dropdown-menu" aria-labelledby="dropdown-modalities-button"
                                @click="modalityFilterClicked" id="modality-filter-dropdown">
                                <li><label class="dropdown-item"><input type="checkbox" data-value="all"
                                            @click="toggleModalityFilter" v-model="allModalities" />&nbsp;{{
                                                $t('all_modalities') }}</label></li>
                                <li><label class="dropdown-item"><input type="checkbox" data-value="none"
                                            @click="toggleModalityFilter" v-model="noneModalities" />&nbsp;{{
                                                $t('no_modalities') }}</label></li>
                                <li>
                                    <hr class="dropdown-divider">
                                </li>
                                <li v-for="modality in uiOptions.ModalitiesFilter" :key="modality">
                                    <label class="dropdown-item"><input type="checkbox" v-bind:data-value="modality"
                                            v-model="filterModalities[modality]" />&nbsp;{{ modality }}</label>
                                </li>
                                <li><button class="btn btn-primary mx-5" @click="closeModalityFilter">{{ $t('close')
                                }}</button></li>
                            </ul>
                        </div>
                        <div v-else-if="columnTag == 'PatientBirthDate'">
                            <Datepicker v-model="filterPatientBirthDateForDatePicker" :enable-time-picker="false" range
                                :format="datePickerFormat" hide-input-icon :preview-format="datePickerFormat" text-input
                                arrow-navigation :highlight="{ weekdays: [6, 0] }" :dark="isDarkMode">
                            </Datepicker>
                        </div>
                        <input v-else-if="hasFilter(columnTag)" type="text" class="form-control study-list-filter"
                            v-model="this.filterGenericTags[columnTag]"
                            v-bind:placeholder="getFilterPlaceholder(columnTag)"
                            v-bind:class="getFilterClass(columnTag)" />
                    </th>
                </tr>
                <tr class="study-table-actions">
                    <th width="2%" :colspan="colSpanBeforeMultiLabelsFilter" scope="col">
                        <div class="form-check" style="margin-left: 0.5rem">
                            <input class="form-check-input" type="checkbox" v-model="allSelected"
                                :indeterminate="isPartialSelected" @click="clickSelectAll">
                            <span style="font-weight: 400; font-size: small;">{{ selectedStudiesCount }}</span>
                        </div>
                    </th>
                    <th width="98%" :colspan="colSpanMultiLabelsFilter + colSpanAfterMultiLabelsFilter" scope="col">
                        <div class="container px-0">
                            <div class="row g-1">
                                <div class="col-6 study-list-bulk-buttons">
                                    <ResourceButtonGroup :resourceLevel="'bulk'" smallIcons="true">
                                    </ResourceButtonGroup>
                                </div>
                                <div class="col-4">
                                    <div v-if="!isSearching && isLoadingMostRecentStudies"
                                        class="alert alert-secondary study-list-alert" role="alert">
                                        <span v-if="isLoadingMostRecentStudies"
                                            class="spinner-border spinner-border-sm alert-icon" role="status"
                                            aria-hidden="true"></span>{{
                                                $t('loading_most_recent_studies') }}
                                    </div>
                                    <div v-else-if="!isSearching && isDisplayingMostRecentStudies"
                                        class="alert alert-secondary study-list-alert" role="alert">
                                        <i class="bi bi-exclamation-triangle-fill alert-icon"></i>{{
                                            $t('displaying_most_recent_studies') }}
                                    </div>
                                    <div v-else-if="!isSearching && showEmptyStudyListIfNoSearch && this['studies/isFilterEmpty']"
                                        class="alert alert-warning study-list-alert" role="alert">
                                        <i class="bi bi-exclamation-triangle-fill alert-icon"></i> {{ $t('enter_search')
                                        }}
                                    </div>
                                    <div v-else-if="!isSearching && isStudyListEmpty"
                                        class="alert alert-warning study-list-alert" role="alert">
                                        <i class="bi bi-exclamation-triangle-fill alert-icon"></i> {{
                                            $t('no_result_found') }}
                                    </div>
                                    <div v-else-if="isSearching" class="alert alert-secondary study-list-alert"
                                        role="alert">
                                        <span v-if="isSearching" class="spinner-border spinner-border-sm alert-icon"
                                            role="status" aria-hidden="true"></span>{{
                                                $t('searching') }}
                                    </div>
                                </div>
                                <div class="col-2">
                                    <button @click="search" v-if="isSearchButtonEnabled" type="submit"
                                        class="form-control study-list-filter btn filter-button btn-secondary search-button"
                                        data-bs-toggle="tooltip"
                                        :class="{ 'is-searching': isSearching, 'is-not-searching': !isSearching }"
                                        title="Search">
                                        <i v-if="!isSearching" class="fa-solid fa-magnifying-glass"></i>
                                        <span v-if="isSearching" class="spinner-border spinner-border-sm" role="status"
                                            aria-hidden="true"></span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </th>
                </tr>
            </thead>
            <StudyItem v-for="studyId in studiesIds" :key="studyId" :id="studyId" :studyId="studyId"
                @deletedStudy="onDeletedStudy">
            </StudyItem>
        </table>
        <Toasts />
    </div>
</template>

<style>
/* Reuse StudyList styles */
:root {
    --filter-margin: 5px;
    --filter-padding: 2px;
}

input.form-control.study-list-filter {
    margin-top: var(--filter-margin);
    margin-bottom: var(--filter-margin);
    padding-top: var(--filter-padding);
    padding-bottom: var(--filter-padding);
    padding-left: 4px;
    padding-right: 4px;
    border-bottom-width: thin;
}

.filter-button {
    border-bottom-width: thin !important;
    border-color: var(--bs-border-color);
}

.search-button {
    padding-left: 0px !important;
}

.is-not-searching {
    background-color: var(--table-filters-is-not-searching-color) !important;
    border-color: var(--table-filters-is-not-searching-color) !important;
}

.is-searching {
    background-color: var(--table-filters-is-searching-color) !important;
    border-color: var(--table-filters-is-searching-color) !important;
}

button.form-control.study-list-filter {
    margin-top: var(--filter-margin);
    margin-bottom: var(--filter-margin);
    padding-top: var(--filter-padding);
    padding-bottom: var(--filter-padding);
}

.study-table {
    table-layout: fixed;
}

.study-column-titles {
    background-color: var(--study-table-header-bg-color) !important;
    font-size: smaller;
}

.study-table-title {
    text-align: left;
    padding-left: 4px;
    padding-right: 4px;
    vertical-align: middle;
    line-height: 1.2rem;
    position: sticky;
}

.study-table-filters {
    background-color: var(--study-table-filter-bg-color);
}

.study-table-filters>th {
    background-color: var(--study-table-filter-bg-color);
    text-align: left;
    padding-left: 6px !important;
    padding-top: 0px;
    padding-bottom: 0px;
    margin-bottom: 5px;
    vertical-align: middle;
}

.study-table-filters>th>button {
    background-color: var(--bs-table-bg);
}

.study-table-actions>th {
    background-color: var(--study-table-actions-bg-color) !important;
    vertical-align: middle;
}

.study-table-actions>th>div {
    background-color: var(--study-table-actions-bg-color) !important;
    text-align: left;
}

.study-list-bulk-buttons {
    margin-top: var(--filter-margin);
}

.study-list-alert {
    margin-top: var(--filter-margin);
    margin-bottom: var(--filter-margin);
    padding-top: var(--filter-padding);
    padding-bottom: var(--filter-padding);
}

.alert-icon {
    margin-right: 0.7rem;
}

.is-invalid-filter {
    border-color: red !important;
    box-shadow: 0 0 0 .25rem rgba(255, 0, 0, .25) !important;
}

.study-table td {
    text-align: left;
    padding-left: 10px;
}
</style>
