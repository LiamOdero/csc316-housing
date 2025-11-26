const INCOME_FAMILY_COLUMNS = [
    { key: "dual-parent-families", label: "Dual-parent families" },
    { key: "single-parent-families", label: "Single-parent families" },
    { key: "single-individuals", label: "Single individuals" }
];

const RENT_STRUCTURE_FILTER = "Row and apartment structures of three units and over";

const RENT_DATA_MAP = {
    city: "GEO",
    date: "REF_DATE",
    value: "VALUE",
    type: "Type of unit",
    structure: "Type of structure"
};

function getCityLabel(value) {
    if (typeof value !== "string") {
        return value;
    }
    const [cityPart] = value.split(",");
    return cityPart.trim();
}

function mapRowBySchema(row, schema) {
    return Object.fromEntries(
        Object.entries(schema).map(([newKey, originalKey]) => {
            const raw = row[originalKey];
            const numericValue = +raw;
            return [newKey, raw !== undefined && !isNaN(numericValue) ? numericValue : raw];
        })
    );
}

function reshapeIncomeData(rows) {
    const tidy = [];
    rows.forEach(row => {
        const year = Number(row.date);
        const city = typeof row.city === "string" ? row.city.trim() : null;
        if (!city || !Number.isFinite(year)) {
            return;
        }
        INCOME_FAMILY_COLUMNS.forEach(({ key, label }) => {
            const value = Number(row[key]);
            if (!Number.isFinite(value)) {
                return;
            }
            tidy.push({
                city,
                date: year,
                familyType: label,
                value
            });
        });
    });
    return tidy;
}

function normalizeRentType(value) {
    if (!value) {
        return value;
    }

    const cleaned = String(value)
        .toLowerCase()
        .trim()
        .replace(/\s+unit(s)?/g, "")
        .replace(/bedroom(s)?/g, "br")
        .replace(/\s*-\s*/g, " ")
        .replace(/\s+/g, " ");

    if (/bachelor/.test(cleaned)) return "0br";
    if (/^(1\b|1br|one)/.test(cleaned)) return "1br";
    if (/^(2\b|2br|two)/.test(cleaned)) return "2br";
    if (/^(3\b|3br|three)/.test(cleaned)) return "3br";

    return cleaned;
}

function createDropdown(data, defaultText, container, options = {}) {
    const dropdownDiv = container.append('div').attr('class', 'dropdown d-inline mx-1');
    const button = dropdownDiv.append('button')
        .attr('class', 'btn btn-outline-primary dropdown-toggle')
        .attr('type', 'button')
        .attr('data-bs-toggle', 'dropdown')
        .attr('aria-expanded', 'false');

    const menu = dropdownDiv.append('ul')
        .attr('class', 'dropdown-menu');

    let currentValue = options.initialSelected ?? (data.length > 0 ? data[0] : null);
    const onChange = typeof options.onChange === 'function' ? options.onChange : () => { };

    if (currentValue) {
        button.text(currentValue);
    } else if (defaultText) {
        button.text(defaultText);
    } else {
        button.text('Select option');
    }

    menu.selectAll('li')
        .data(data)
        .enter()
        .append('li')
        .append('a')
        .attr('class', 'dropdown-item')
        .attr('href', '#')
        .text(d => d)
        .on('click', (event, value) => {
            event.preventDefault();
            currentValue = value;
            button.text(value);
            onChange(currentValue);
        });

    if (currentValue) {
        onChange(currentValue);
    }

    return {
        element: dropdownDiv,
        getSelected: () => currentValue,
        setSelected: value => {
            currentValue = value;
            button.text(value || defaultText || 'Select option');
            if (value) {
                onChange(currentValue);
            }
        }
    };
}

function createSelection(data, defaultText, container, options = {}) {
    const selectionDiv = container.append('div').attr('class', 'dropdown d-inline mx-1');
    const button = selectionDiv.append('button')
        .attr('class', 'btn btn-outline-secondary dropdown-toggle')
        .attr('type', 'button')
        .attr('data-bs-toggle', 'dropdown')
        .attr('data-bs-auto-close', 'outside')
        .attr('aria-expanded', 'false')
        .text(defaultText || 'Select options');

    const menu = selectionDiv.append('div')
        .attr('class', 'dropdown-menu p-2');

    const initialSelection = Array.isArray(options.initialSelected)
        ? options.initialSelected.map(city => city)
        : Array.isArray(options.initialSelected)
            ? options.initialSelected
            : [options.initialSelected];
    const selected = new Set(initialSelection);
    const onSelectionChange = typeof options.onChange === 'function' ? options.onChange : () => { };

    const updateButtonLabel = () => {
        if (selected.size === 0) {
            button.text(defaultText || 'Select options');
            return;
        }
        if (selected.size === 1) {
            const values = Array.from(selected).map(city => getCityLabel(city));
            button.text(values.join(', '));
            return;
        }
        const values = Array.from(selected).map(city => getCityLabel(city));
        button.text(`${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`);
    };

    const items = menu.selectAll('label')
        .data(data)
        .enter()
        .append('label')
        .attr('class', 'dropdown-item form-check d-flex align-items-center gap-2');

    const checkboxes = items.append('input')
        .attr('class', 'form-check-input m-0')
        .attr('type', 'checkbox')
        .attr('value', d => d)
        .property('checked', d => selected.has(d))
        .on('change', function (_, value) {
            if (this.checked) {
                selected.add(value);
            } else {
                selected.delete(value);
            }
            updateButtonLabel();
            onSelectionChange(Array.from(selected));
        });

    items.append('span').text(d => d);

    updateButtonLabel();
    onSelectionChange(Array.from(selected));

    return {
        element: selectionDiv,
        getSelected: () => Array.from(selected),
        setSelected: values => {
            selected.clear();
            (values || []).forEach(v => selected.add(v));
            checkboxes.property('checked', d => selected.has(d));
            updateButtonLabel();
            onSelectionChange(Array.from(selected));
        }
    };
}

let vis, caption, rentInfo, slider, rentData, incomeData;

function initIncomeVis(rentData, incomeData) {
    rentData.forEach(d => {
        d.type = normalizeRentType(d.type);
        d.cityLabel = getCityLabel(d.city);
        d.totalLabel = d.cityLabel;
    });

    incomeData.forEach(d => {
        d.cityLabel = getCityLabel(d.city);
    });

    const yearValues = Array.from(new Set([
        ...rentData.map(d => Number(d.date)),
        ...incomeData.map(d => Number(d.date))
    ].filter(year => Number.isFinite(year)))).sort((a, b) => a - b);

    const minYear = yearValues[0] ?? 2000;
    const maxYear = yearValues[yearValues.length - 1] ?? 2023;

    vis = new IncomeRentComparison({
        parentElement: "#vis4-container",
        rentData,
        incomeData,
        initialYear: maxYear
    });

    caption = new Caption({
        parentElement: "#vis4-caption",
        text: "",
        rentData,
        incomeData,
        onCityChange: cities => vis.setCityFilter(cities),
        onHouseholdChange: household => vis.setHouseholdFilter(household)
    });

    vis.init();
    caption.init();

    rentInfo = new RentInfo({
        parentElement: "#vis4-rentinfo",
        legendElement: "#vis4-legend"
    });

    rentInfo.init();
    vis.setRentInfo(rentInfo);

    slider = new Slider({
        parentElement: "#vis4-slider",
        min: minYear,
        max: maxYear,
        initialYear: vis.selectedYear ?? maxYear,
        onChange: year => vis.setYear(year)
    });

    slider.init();

}

function destructIncomeVis() {
    d3.select("#vis4-container",).selectAll("*").remove();
    d3.select("#vis4-caption").selectAll("*").remove();
    d3.select("#vis4-rentinfo").selectAll("*").remove();
    d3.select("#vis4-slider").selectAll("*").remove();
}

class IncomeRentComparison {
    constructor(config) {
        this.config = config;
        this.parentSelector = this.config.parentElement;
        this.parentElement = d3.select(this.parentSelector);
        this.rentData = this.config.rentData;
        this.incomeData = this.config.incomeData;
        this.selectedApartmentTypes = new Set(['rent']);
        this.selectedCities = new Set(this.incomeData.map(d => d.city));
        this.selectedHousehold = null;
        this.cityMetrics = {};
        this.focusedCity = null;
        this.secondaryFocusYear = null;
        this.focusMarker = null;
        this.focusChartGroup = null;
        this.focusChartLeft = null;
        this.focusChartCenter = null;
        this.focusChartRight = null;
        this.backButtonGroup = null;
        this.focusCityLabel = null;
        this.cardGroup = null;
        this.rentInfo = null;
        this.lineGenerator = null;
        this.focusCardFixedWidth = null;
        this.seriesColors = {
            income: '#D9D9D9',
            rent: '#c1121f'
        };
        this.seriesLabels = {
            income: 'Monthly income',
            rent: 'Monthly rent'
        };
        this.seriesTooltipLabels = {
            income: 'Income',
            rent: 'Rent'
        };
        this.baseBlockWidth = 75;
        this.focusCardWidth = 130;
        this.focusCardHalfWidth = this.focusCardWidth / 2;
        this.focusCardMinWidth = 40;
        this.rentAggregates = {};
        this.incomeAggregates = {};
        const yearSet = new Set([
            ...this.rentData.map(d => Number(d.date)),
            ...this.incomeData.map(d => Number(d.date))
        ].filter(year => Number.isFinite(year)));
        this.availableYears = Array.from(yearSet).sort((a, b) => a - b);
        const configuredYear = Number(this.config.initialYear);
        if (Number.isFinite(configuredYear) && yearSet.has(configuredYear)) {
            this.selectedYear = configuredYear;
        } else {
            this.selectedYear = this.availableYears.length ? this.availableYears[this.availableYears.length - 1] : null;
        }

        this.precomputeData();
    }

    init() {
        this.createVisualization();
    }

    createVisualization() {
        const vis = this;
        vis.margin = { top: 60, right: 20, bottom: 60, left: 60 };

        const containerNode = vis.parentElement.node();
        if (!containerNode) {
            console.error(`IncomeRentComparison: container '${vis.parentSelector}' not found.`);
            return;
        }

        const bounds = containerNode.getBoundingClientRect();
        const rawWidth = bounds.width - vis.margin.left - vis.margin.right;
        const rawHeight = bounds.height - vis.margin.top - vis.margin.bottom;

        vis.width = Math.max(rawWidth, 320);
        vis.height = Math.max(rawHeight, 360);

        const svgRoot = vis.parentElement.append('svg')
            .attr('width', vis.width + vis.margin.left + vis.margin.right)
            .attr('height', vis.height + vis.margin.top + vis.margin.bottom);

        vis.svg = svgRoot.append('g')
            .attr('transform', `translate(${vis.margin.left},${vis.margin.top})`);

        vis.yScale = d3.scaleLinear()
            .domain([0, 12000])
            .range([0, vis.height]);

        const yAxis = d3.axisLeft(vis.yScale)
            .ticks(6)
            .tickFormat(d3.format(','));

        vis.yAxisGroup = vis.svg.append('g')
            .attr('class', 'axis axis-y')
            .call(yAxis);


        const xDomain = [2000, 2023];
        const xTickValues = d3.range(xDomain[0], xDomain[1] + 1);

        vis.xPadding = 0;

        vis.xScale = d3.scaleLinear()
            .domain(xDomain)
            .range([vis.xPadding, vis.width - vis.xPadding]);

        vis.xAxis = d3.axisTop(vis.xScale)
            .tickValues(xTickValues)
            .tickFormat(d3.format('d'));

        vis.xAxisGroup = vis.svg.append('g')
            .attr('class', 'axis axis-x')
            .attr('transform', 'translate(0, 0)')
            .style('opacity', 0)
            .style('pointer-events', 'none')
            .call(vis.xAxis);

        vis.focusMarker = vis.svg.append('line')
            .attr('class', 'focus-year-marker')
            .attr('y1', 0)
            .attr('y2', vis.height)
            .attr('stroke', '#c1121f')
            .attr('stroke-width', 1.2)
            .attr('stroke-dasharray', '3 3')
            .style('opacity', 0)
            .style('pointer-events', 'none');

        vis.focusChartGroup = vis.svg.append('g')
            .attr('class', 'focus-chart')
            .style('opacity', 0)
            .style('pointer-events', 'none');

        vis.focusChartOverlay = vis.focusChartGroup.append('rect')
            .attr('class', 'focus-chart-overlay')
            .attr('fill', 'transparent')
            .attr('pointer-events', 'all')
            .on('click', event => this.handleFocusBandClick(event))
            .on('mousemove', event => this.handleHoverMove(event))
            .on('mouseleave', () => this.hideHoverMarker());

        vis.focusChartLeft = vis.focusChartGroup.append('g')
            .attr('class', 'focus-chart-left');

        vis.focusChartCenter = vis.focusChartGroup.append('g')
            .attr('class', 'focus-chart-center');

        vis.focusChartRight = vis.focusChartGroup.append('g')
            .attr('class', 'focus-chart-right');

        vis.focusCityLabel = vis.svg.append('text')
            .attr('class', 'focus-city-label')
            .attr('x', vis.width / 2)
            .attr('y', -24)
            .attr('text-anchor', 'middle')
            .attr('fill', '#111827')
            .attr('font-weight', 600)
            .attr('font-size', 18)
            .style('opacity', 0);

        vis.markerGroup = vis.svg.append('g')
            .attr('class', 'year-marker-group');

        vis.backButtonGroup = vis.svg.append('g')
            .attr('class', 'back-to-rect-btn')
            .style('opacity', 0)
            .style('pointer-events', 'none')
            .on('click', () => this.toggleCityFocus(null));

        vis.backButtonGroup.append('rect')
            .attr('class', 'back-btn-bg')
            .attr('rx', 6)
            .attr('ry', 6)
            .attr('fill', '#ffffff')
            .attr('stroke', '#6b7280')
            .attr('stroke-width', 1.2)
            .style('pointer-events', 'all');

        vis.backButtonGroup.append('text')
            .attr('class', 'back-btn-text')
            .attr('fill', '#111827')
            .attr('font-size', 12)
            .attr('font-weight', 600)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .style('pointer-events', 'none')
            .text('Back to rectangle view');

        this.lineGenerator = d3.line()
            .defined(d => Number.isFinite(d.value))
            .x(d => Number.isFinite(d.xOverride) ? d.xOverride : vis.xScale(d.year))
            .y(d => vis.yScale(d.value));

        this.areaGenerator = d3.area()
            .defined(d => Number.isFinite(d.value))
            .x(d => Number.isFinite(d.xOverride) ? d.xOverride : vis.xScale(d.year))
            .y0(0)
            .y1(d => vis.yScale(d.value));

        vis.cardGroup = vis.svg.append('g')
            .attr('class', 'city-cards');



        this.update();
    }

    setApartmentTypes(types) {
        this.selectedApartmentTypes = new Set(['rent']);
        this.update();
    }

    setCityFilter(cities) {
        this.selectedCities = new Set(cities || []);
        this.update();
    }

    setHouseholdFilter(household) {
        this.selectedHousehold = household || null;
        this.update();
    }

    setRentInfo(rentInfo) {
        this.rentInfo = rentInfo || null;
        if (this.rentInfo) {
            if (typeof this.rentInfo.setLegendSources === 'function') {
                this.rentInfo.setLegendSources(this.seriesColors, this.seriesTooltipLabels, this.seriesLabels);
            }
            this.rentInfo.update(null);
        }
    }

    setYear(year) {
        const numericYear = Number(year);
        if (!Number.isFinite(numericYear)) {
            return;
        }
        if (this.selectedYear === numericYear) {
            return;
        }
        this.selectedYear = numericYear;
        this.update();
    }

    precomputeData() {
        const rentAccumulator = {};
        this.rentData.forEach(d => {
            const city = d.city;
            const type = d.type;
            const year = Number(d.date);
            const value = Number(d.value);
            if (!city || !type || !Number.isFinite(year) || !Number.isFinite(value)) {
                return;
            }
            rentAccumulator[city] = rentAccumulator[city] || {};
            rentAccumulator[city][year] = rentAccumulator[city][year] || {};
            rentAccumulator[city][year][type] = rentAccumulator[city][year][type] || { sum: 0, count: 0 };
            rentAccumulator[city][year][type].sum += value;
            rentAccumulator[city][year][type].count += 1;
        });

        this.rentAggregates = {};
        Object.entries(rentAccumulator).forEach(([city, yearMap]) => {
            const cityStore = this.rentAggregates[city] = {};
            Object.entries(yearMap).forEach(([yearKey, typeMap]) => {
                const numericYear = Number(yearKey);
                const yearStore = cityStore[numericYear] = {};

                // Average across available unit types into a single "rent" value
                const typeAverages = Object.values(typeMap)
                    .map(stats => stats.count > 0 ? stats.sum / stats.count : null)
                    .filter(value => Number.isFinite(value));
                const rentValue = typeAverages.length ? d3.mean(typeAverages) : null;

                yearStore.rent = {
                    value: rentValue,
                    count: typeAverages.length
                };
            });
        });

        this.incomeAggregates = {};
        this.incomeData.forEach(d => {
            const city = d.city;
            const familyType = d.familyType || 'Unknown';
            const year = Number(d.date);
            const value = Number(d.value);
            if (!city || !Number.isFinite(year) || !Number.isFinite(value)) {
                return;
            }
            const cityStore = this.incomeAggregates[city] || (this.incomeAggregates[city] = {});
            const yearStore = cityStore[year] || (cityStore[year] = {});
            yearStore[familyType] = {
                value: value / 12,
                count: 1
            };
        });
    }

    getRentStats(city, year, type) {
        if (!city || !type || !Number.isFinite(Number(year))) {
            return { value: null, count: 0 };
        }
        const cityStore = this.rentAggregates[city];
        if (!cityStore) {
            return { value: null, count: 0 };
        }
        const yearStore = cityStore[Number(year)];
        if (!yearStore) {
            return { value: null, count: 0 };
        }
        const entry = yearStore[type];
        if (!entry) {
            return { value: null, count: 0 };
        }
        return entry;
    }

    getIncomeStats(city, year, household) {
        if (!city || !Number.isFinite(Number(year))) {
            return { value: null, count: 0 };
        }
        const cityStore = this.incomeAggregates[city];
        if (!cityStore) {
            return { value: null, count: 0 };
        }
        const yearStore = cityStore[Number(year)];
        if (!yearStore) {
            return { value: null, count: 0 };
        }
        if (household) {
            const entry = yearStore[household];
            if (!entry) {
                return { value: null, count: 0 };
            }
            return entry;
        }
        const entries = Object.values(yearStore);
        if (!entries.length) {
            return { value: null, count: 0 };
        }
        const values = entries
            .map(entry => entry.value)
            .filter(value => Number.isFinite(value));
        const value = values.length ? d3.mean(values) : null;
        const count = entries.reduce((sum, entry) => sum + entry.count, 0);
        return { value, count };
    }

    getYearsForCity(city) {
        const rentYears = this.rentAggregates[city]
            ? Object.keys(this.rentAggregates[city]).map(year => Number(year))
            : [];
        const incomeYears = this.incomeAggregates[city]
            ? Object.keys(this.incomeAggregates[city]).map(year => Number(year))
            : [];
        const yearSet = new Set([...rentYears, ...incomeYears]);
        return Array.from(yearSet).sort((a, b) => a - b);
    }

    update() {
        if (!this.svg || !this.yScale) {
            return;
        }

        const labelY = -24;
        const labelRotationDeg = -30;
        const noCitySelection = this.selectedCities.size === 0;
        const yearFilterActive = Number.isFinite(this.selectedYear);

        const rentTypeOrder = ['rent'];
        const activeRentTypes = rentTypeOrder;

        const cityKeys = noCitySelection ? [] : Array.from(this.selectedCities);
        const cityYearScopes = new Map();

        const filteredRent = [];
        const filteredIncome = [];
        let rentRecordCount = 0;
        let incomeRecordCount = 0;

        cityKeys.forEach(city => {
            let yearsToUse;
            if (yearFilterActive && Number.isFinite(this.selectedYear)) {
                yearsToUse = [this.selectedYear];
            } else {
                const derivedYears = this.getYearsForCity(city);
                yearsToUse = derivedYears.length ? derivedYears : [];
            }
            if ((!yearsToUse || !yearsToUse.length) && yearFilterActive && Number.isFinite(this.selectedYear)) {
                yearsToUse = [this.selectedYear];
            }
            cityYearScopes.set(city, yearsToUse);

            yearsToUse.forEach(year => {
                activeRentTypes.forEach(type => {
                    const rentStats = this.getRentStats(city, year, type);
                    if (!Number.isFinite(rentStats.value)) {
                        return;
                    }
                    filteredRent.push({
                        cityLabel: city,
                        type,
                        date: year,
                        value: rentStats.value
                    });
                    rentRecordCount += rentStats.count;
                });

                const incomeStats = this.getIncomeStats(city, year, this.selectedHousehold);
                if (Number.isFinite(incomeStats.value)) {
                    filteredIncome.push({
                        cityLabel: city,
                        familyType: this.selectedHousehold || 'All households',
                        date: year,
                        value: incomeStats.value
                    });
                    incomeRecordCount += incomeStats.count;
                }
            });
        });

        const cityMetrics = {};
        cityKeys.forEach(city => {
            const yearsToAverageBase = cityYearScopes.get(city) || [];
            const yearsToAverage = yearsToAverageBase.length
                ? yearsToAverageBase
                : (yearFilterActive && Number.isFinite(this.selectedYear) ? [this.selectedYear] : []);

            const rentValues = rentTypeOrder.map(type => {
                const values = yearsToAverage
                    .map(year => this.getRentStats(city, year, type).value)
                    .filter(value => Number.isFinite(value));
                return values.length ? d3.mean(values) : null;
            });

            const incomeValues = yearsToAverage
                .map(year => this.getIncomeStats(city, year, this.selectedHousehold).value)
                .filter(value => Number.isFinite(value));
            const incomeValue = incomeValues.length ? d3.mean(incomeValues) : null;

            cityMetrics[city] = {
                income: incomeValue,
                rent: rentValues
            };
        });

        this.cityMetrics = cityMetrics;

        this.filteredRent = filteredRent;
        this.filteredIncome = filteredIncome;

        const baseBlockWidth = this.baseBlockWidth;
        const blockHeight = 80;
        const gap = 8;
        const startX = 8;
        const startY = 0;
        let overviewStartX = startX;

        const cityEntries = Object.entries(this.cityMetrics);
        if (this.focusedCity && !this.cityMetrics[this.focusedCity]) {
            this.focusedCity = null;
            this.secondaryFocusYear = null;
        }
        if (cityEntries.length === 0 && this.focusedCity) {
            this.focusedCity = null;
            this.secondaryFocusYear = null;
        }

        const hasFocusedCity = Boolean(this.focusedCity);
        const focusYear = hasFocusedCity
            ? (Number.isFinite(this.selectedYear) ? this.selectedYear : (this.xScale ? this.xScale.domain()[0] : null))
            : null;

        const comparisonYear = hasFocusedCity && Number.isFinite(this.secondaryFocusYear)
            ? this.secondaryFocusYear
            : null;

        let computedFocusWidth = this.focusCardFixedWidth;
        if (this.xScale) {
            const domain = this.xScale.domain();
            const domainStart = Number(domain[0]);
            const domainEnd = Number(domain[1]);
            if (Number.isFinite(domainStart) && Number.isFinite(domainEnd) && domainEnd > domainStart) {
                const intervals = domainEnd - domainStart + 1;
                const widthPerInterval = this.width / intervals;
                if (Number.isFinite(widthPerInterval) && widthPerInterval > 0) {
                    computedFocusWidth = widthPerInterval;
                }
            }
        }

        if (!Number.isFinite(computedFocusWidth) || computedFocusWidth <= 0) {
            computedFocusWidth = this.focusCardWidth;
        }

        if (this.focusCardMinWidth) {
            computedFocusWidth = Math.max(computedFocusWidth, this.focusCardMinWidth);
        }

        this.focusCardFixedWidth = computedFocusWidth;
        this.focusCardHalfWidth = computedFocusWidth / 2;

        if (this.xScale) {
            const padding = 0;
            this.xScale.range([padding, this.width - padding]);
            if (this.xAxisGroup && this.xAxis) {
                this.xAxisGroup.call(this.xAxis);
                this.xAxisGroup.select('.domain')
                    .attr('d', `M0.5,0.5H${this.width}`);
            }
        }

        const blockWidth = hasFocusedCity ? this.focusCardFixedWidth : baseBlockWidth;

        // Keep overview cards flush to the left axis for space efficiency
        if (!hasFocusedCity) {
            overviewStartX = startX;
        }

        const computeCardLeft = year => {
            if (!hasFocusedCity || !Number.isFinite(year)) {
                return overviewStartX;
            }
            const desired = this.xScale(year) - (blockWidth / 2);
            const minLeft = 0;
            const maxLeft = this.width - blockWidth;
            return Math.max(minLeft, Math.min(desired, maxLeft));
        };

        const focusLeftX = hasFocusedCity && Number.isFinite(focusYear) ? computeCardLeft(focusYear) : null;

        if (this.focusCityLabel) {
            this.focusCityLabel
                .attr('x', this.width / 2)
                .style('opacity', hasFocusedCity ? 1 : 0)
                .text(hasFocusedCity ? this.focusedCity : '');
        }

        const focusSeries = hasFocusedCity ? this.buildFocusSeries(this.focusedCity) : [];

        let primaryInfo = null;
        let comparisonInfo = null;
        const cardData = [];
        if (!hasFocusedCity) {
            cityEntries.forEach(([city, metrics], index) => {
                cardData.push({
                    key: city,
                    city,
                    metrics,
                    kind: 'overview',
                    year: null,
                    width: baseBlockWidth,
                    leftX: overviewStartX + index * (baseBlockWidth + gap)
                });
            });
        } else {
            const city = this.focusedCity;
            const primaryMetrics = this.cityMetrics[city] || this.computeCityMetricsForYear(city, focusYear);
            if (primaryMetrics) {
                primaryInfo = {
                    year: focusYear,
                    metrics: primaryMetrics
                };
                cardData.push({
                    key: `${city}-primary`,
                    city,
                    metrics: primaryMetrics,
                    kind: 'primary',
                    year: focusYear,
                    width: blockWidth,
                    leftX: focusLeftX !== null ? focusLeftX : computeCardLeft(focusYear)
                });
            }

            if (comparisonYear !== null && comparisonYear !== focusYear) {
                const comparisonMetrics = this.computeCityMetricsForYear(city, comparisonYear);
                if (comparisonMetrics) {
                    comparisonInfo = {
                        year: comparisonYear,
                        metrics: comparisonMetrics
                    };
                    cardData.push({
                        key: `${city}-comparison-${comparisonYear}`,
                        city,
                        metrics: comparisonMetrics,
                        kind: 'comparison',
                        year: comparisonYear,
                        width: blockWidth,
                        leftX: computeCardLeft(comparisonYear)
                    });
                } else {
                    this.secondaryFocusYear = null;
                }
            }

            cardData.sort((a, b) => {
                if (!Number.isFinite(a.year) || !Number.isFinite(b.year)) {
                    return 0;
                }
                return a.year - b.year;
            });
        }

        const markerData = hasFocusedCity
            ? cardData
                .filter(card => card.kind === 'primary' || card.kind === 'comparison')
                .map(card => ({
                    ...card,
                    centerX: this.xScale ? this.xScale(card.year) : (card.leftX ?? 0)
                }))
            : [];

        if (this.rentInfo) {
            if (hasFocusedCity && primaryInfo && Number.isFinite(primaryInfo.year)) {
                const comparisonPayload = comparisonInfo && Number.isFinite(comparisonInfo.year)
                    ? comparisonInfo
                    : null;
                this.rentInfo.update({
                    city: this.focusedCity,
                    familyType: this.selectedHousehold || 'All households',
                    primary: primaryInfo,
                    comparison: comparisonPayload,
                    rentTypeOrder,
                    activeRentTypes,
                    tooltipLabels: this.seriesTooltipLabels
                });
            } else {
                this.rentInfo.update(null);
            }
        }

        if (this.backButtonGroup) {
            const btnWidth = 170;
            const btnHeight = 28;
            const padding = 8;
            const x = Math.max(padding, this.width - btnWidth - padding);
            const y = Math.max(padding, this.height - btnHeight - padding);

            this.backButtonGroup
                .attr('transform', `translate(${x},${y})`)
                .style('opacity', hasFocusedCity ? 1 : 0)
                .style('pointer-events', hasFocusedCity ? 'all' : 'none')
                .style('cursor', hasFocusedCity ? 'pointer' : 'default');

            this.backButtonGroup.select('.back-btn-bg')
                .attr('width', btnWidth)
                .attr('height', btnHeight);

            this.backButtonGroup.select('.back-btn-text')
                .attr('x', btnWidth / 2)
                .attr('y', btnHeight / 2);

            if (typeof this.backButtonGroup.raise === 'function') {
                this.backButtonGroup.raise();
            }
        }

        if (this.markerGroup) {
            const markers = this.markerGroup.selectAll('.year-marker')
                .data(markerData, d => d.key);

            markers.exit().remove();

            const markersEnter = markers.enter()
                .append('g')
                .attr('class', 'year-marker')
                .style('cursor', 'pointer')
                .on('click', (_, d) => handleCardClick(d));

            markersEnter.append('line')
                .attr('class', 'year-marker-line');

            markersEnter.append('circle')
                .attr('class', 'year-marker-income');

            markersEnter.append('circle')
                .attr('class', 'year-marker-rent');

            const markersMerged = markersEnter.merge(markers);

            markersMerged
                .attr('transform', d => `translate(${d.centerX ?? 0},0)`)
                .style('pointer-events', hasFocusedCity ? 'all' : 'none')
                .style('opacity', hasFocusedCity ? 1 : 0);

            const getIncomeY = d => {
                const value = d.metrics?.income;
                return Number.isFinite(value) ? this.yScale(value) : null;
            };
            const getRentY = d => {
                const value = Array.isArray(d.metrics?.rent) ? d.metrics.rent[0] : null;
                return Number.isFinite(value) ? this.yScale(value) : null;
            };

            markersMerged.select('.year-marker-line')
                .attr('x1', 0)
                .attr('x2', 0)
                .attr('y1', 0)
                .attr('y2', this.height)
                .attr('stroke', '#000')
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', d => d.kind === 'comparison' ? '4 3' : null);

            markersMerged.select('.year-marker-income')
                .attr('cx', 0)
                .attr('cy', d => getIncomeY(d) ?? -10)
                .attr('r', 5)
                .attr('fill', this.seriesColors.income)
                .attr('stroke', '#000')
                .attr('stroke-width', 1.2)
                .style('display', d => Number.isFinite(getIncomeY(d)) ? null : 'none');

            markersMerged.select('.year-marker-rent')
                .attr('cx', 0)
                .attr('cy', d => getRentY(d) ?? -10)
                .attr('r', 5)
                .attr('fill', this.seriesColors.rent)
                .attr('stroke', '#000')
                .attr('stroke-width', 1.2)
                .style('display', d => Number.isFinite(getRentY(d)) ? null : 'none');

            if (typeof this.markerGroup.raise === 'function') {
                this.markerGroup.raise();
            }
        }

        this.xAxisGroup
            .style('opacity', hasFocusedCity ? 1 : 0);

        if (this.focusChartLeft) this.focusChartLeft.selectAll('*').remove();
        if (this.focusChartCenter) this.focusChartCenter.selectAll('*').remove();
        if (this.focusChartRight) this.focusChartRight.selectAll('*').remove();

        // ---------------------------------------------------------------------
        // Focused graph view (lines/areas/markers) when a city is selected
        // ---------------------------------------------------------------------
        if (this.focusChartGroup) {
            this.focusChartGroup
                .style('opacity', hasFocusedCity ? 1 : 0)
                .style('pointer-events', hasFocusedCity ? 'all' : 'none');

            const seriesData = hasFocusedCity ? focusSeries : [];

            const seriesSel = this.focusChartGroup
                .selectAll('.focus-series')
                .data(seriesData, d => d.key);

            seriesSel.exit().remove();

            const seriesEnter = seriesSel.enter()
                .append('g')
                .attr('class', 'focus-series');

            seriesEnter.append('path')
                .attr('class', 'focus-area');

            seriesEnter.append('path')
                .attr('class', 'focus-line')
                .attr('fill', 'none')
                .attr('stroke-linecap', 'round')
                .attr('stroke-linejoin', 'round');

            seriesEnter.append('g')
                .attr('class', 'focus-nodes');

            const seriesMerged = seriesEnter.merge(seriesSel);

            seriesMerged
                .style('opacity', hasFocusedCity ? 1 : 0)
                .style('pointer-events', hasFocusedCity ? 'all' : 'none');

            seriesMerged.select('.focus-area')
                .attr('fill', d => this.seriesColors[d.key] || '#111827')
                .attr('fill-opacity', 0.35)
                .attr('stroke', 'none')
                .attr('d', d => this.areaGenerator ? this.areaGenerator(d.values) : null);

            seriesMerged.select('.focus-line')
                .attr('stroke-width', 2)
                .attr('stroke', d => this.seriesColors[d.key] || '#111827')
                .attr('d', d => this.lineGenerator ? this.lineGenerator(d.values) : null);

            seriesMerged.each((series, idx, nodes) => {
                const nodeGroup = d3.select(nodes[idx]).select('.focus-nodes');
                const nodeData = (series.values || []).filter(v => Number.isFinite(v.value));
                const nodeSel = nodeGroup.selectAll('circle').data(nodeData, d => d.year);
                nodeSel.exit().remove();
                const nodeEnter = nodeSel.enter().append('circle');
                nodeEnter.attr('r', 3);
                const nodeMerged = nodeEnter.merge(nodeSel);
                nodeMerged
                    .attr('cx', d => this.xScale ? this.xScale(d.year) : 0)
                    .attr('cy', d => this.yScale ? this.yScale(d.value) : 0)
                    .attr('fill', this.seriesColors[series.key] || '#111827')
                    .attr('stroke', '#111')
                    .attr('stroke-width', 1);
            });

            if (typeof this.focusChartGroup.raise === 'function') {
                this.focusChartGroup.raise();
            }

            if (this.focusChartOverlay) {
                const btnHeight = 28;
                const btnPadding = 8;
                const reservedHeight = hasFocusedCity ? (btnHeight + btnPadding * 2) : 0;
                const overlayHeight = Math.max(0, this.height - reservedHeight);
                this.focusChartOverlay
                    .attr('width', this.width)
                    .attr('height', overlayHeight)
                    .style('opacity', hasFocusedCity ? 1 : 0)
                    .style('pointer-events', hasFocusedCity ? 'all' : 'none');
                if (typeof this.focusChartOverlay.raise === 'function') {
                    this.focusChartOverlay.raise();
                }
                if (this.focusMarker && typeof this.focusMarker.raise === 'function') {
                    this.focusMarker.raise();
                }
                if (this.backButtonGroup && typeof this.backButtonGroup.raise === 'function') {
                    this.backButtonGroup.raise();
                }
            }
        }

        // ---------------------------------------------------------------------
        // Rectangle overview (city cards)
        // ---------------------------------------------------------------------
        const cardRoot = this.cardGroup || this.svg;
        const cityGroups = cardRoot.selectAll('.city-card')
            .data(cardData, d => d.key);

        cityGroups.exit().remove();
        this.svg.selectAll('.vis-no-selection').remove();

        // Base card shell; real sizes are set below using data-driven attrs
        const cityGroupsEnter = cityGroups.enter()
            .append('g')
            .attr('class', 'city-card');

        cityGroupsEnter.append('rect')
            .attr('class', 'city-card-bg')
            .attr('width', blockWidth)
            .attr('height', blockHeight)
            .attr('fill', this.seriesColors.income)
            .attr('stroke', 'none')
            .attr('stroke-width', 0)
            .attr('pointer-events', 'none');

        cityGroupsEnter.append('rect')
            .attr('class', 'rent-block')
            .attr('width', blockWidth)
            .attr('height', blockHeight)
            .attr('fill', this.seriesColors.rent)
            .attr('stroke', 'none')
            .attr('stroke-width', 0)
            .attr('pointer-events', 'none');
        
        cityGroupsEnter.append('text')
            .attr('class', 'rent-percentage-text')
            .attr('x', blockWidth / 2)
            .attr('y', blockHeight / 2)
            .attr('text-anchor', 'middle')
            .attr('fill', this.seriesColors.rent)
            .attr('font-weight', '600')
            .attr('font-size', 12);

        cityGroupsEnter.append('rect')
            .attr('class', 'city-card-overlay')
            .attr('width', blockWidth)
            .attr('height', blockHeight)
            .attr('fill', '#000')
            .attr('fill-opacity', 0)
            .attr('stroke', '#000000')
            .attr('stroke-width', 1);

        cityGroupsEnter.append('text')
            .attr('class', 'city-card-label')
            .attr('x', blockWidth / 2)
            .attr('y', labelY)
            .attr('text-anchor', 'middle')
            .attr('fill', '#1f2937')
            .attr('font-weight', '600')
            .attr('font-size', 12);

        cityGroupsEnter.append('text')
            .attr('class', 'city-card-status')
            .attr('x', blockWidth / 2)
            .attr('y', blockHeight / 2)
            .attr('text-anchor', 'middle')
            .attr('fill', '#6b7280')
            .attr('font-size', 12)
            .attr('font-style', 'italic');

        cityGroupsEnter.append('g')
            .attr('class', 'city-card-tooltips');

        const cityGroupsMerged = cityGroupsEnter.merge(cityGroups);

        const handleCardClick = d => {
            if (!hasFocusedCity) {
                this.toggleCityFocus(d.city);
                return;
            }
            if (d.kind === 'primary') {
                if (this.secondaryFocusYear !== null) {
                    this.secondaryFocusYear = null;
                    this.update();
                } else {
                    this.toggleCityFocus(d.city);
                }
            } else if (d.kind === 'comparison') {
                this.secondaryFocusYear = null;
                this.update();
            }
        };

        cityGroupsMerged
            .attr('transform', (d, i) => {
                const cardWidth = d.width ?? (hasFocusedCity ? blockWidth : baseBlockWidth);
                const left = Number.isFinite(d.leftX) ? d.leftX : (startX + i * (cardWidth + gap));
                return `translate(${left}, ${startY})`;
            })
            .classed('is-focused', d => hasFocusedCity && d.kind === 'primary')
            .classed('is-secondary', d => hasFocusedCity && d.kind === 'comparison')
            .classed('is-hovered', false)
            .style('display', hasFocusedCity ? 'none' : null);

        if (hasFocusedCity) {
            cityGroupsMerged.classed('is-hovered', false);
        }

        const hasIncome = metrics => metrics && Number.isFinite(metrics.income);
        const cardWidthFor = d => d.width ?? (hasFocusedCity ? blockWidth : baseBlockWidth);
        const incomeHeight = metrics => hasIncome(metrics) ? this.yScale(metrics.income) : 0;
        const rentHeight = (metrics, index) => {
            if (!metrics || !Array.isArray(metrics.rent)) {
                return 0;
            }
            const value = metrics.rent[index];
            return Number.isFinite(value) ? this.yScale(value) : 0;
        };
        const percentageRentOfIncomeText = (metrics, index) => {
            if (!metrics || !Array.isArray(metrics.rent) || !Number.isFinite(metrics.income) || metrics.income === 0) {
                return null;
            }
            let val = metrics.rent[index] / metrics.income;
            val = Math.round(val * 1000) / 10; // one decimal place
            return `${val}%`;
        };

        cityGroupsMerged.select('.city-card-label')
            .attr('x', d => cardWidthFor(d) / 2)
            .attr('y', labelY)
            .attr('transform', d => {
                const w = cardWidthFor(d);
                const cx = w / 2;
                return `rotate(${labelRotationDeg} ${cx} ${labelY})`;
            })
            .text(d => d.city.split(',')[0])
            .style('display', hasFocusedCity ? 'none' : null);

        cityGroupsMerged.select('.city-card-bg')
            .attr('width', d => cardWidthFor(d))
            .attr('height', d => incomeHeight(d.metrics))
            .style('display', d => hasIncome(d.metrics) && !hasFocusedCity ? null : 'none');

        cityGroupsMerged.select('.rent-block')
            .attr('width', d => cardWidthFor(d))
            .attr('height', d => rentHeight(d.metrics, 0))
            .style('display', d => hasIncome(d.metrics) && !hasFocusedCity ? null : 'none');
        

        cityGroupsMerged.select('.rent-percentage-text')
            .attr('y', d => rentHeight(d.metrics, 0) + 15)
            .attr('x', d => cardWidthFor(d) / 2)
            .text(d => percentageRentOfIncomeText(d.metrics, 0))
            .style('display', d => hasIncome(d.metrics) && !hasFocusedCity ? null : 'none');

        cityGroupsMerged.select('.city-card-overlay')
            .attr('width', d => cardWidthFor(d))
            .attr('height', d => incomeHeight(d.metrics))
            .style('display', d => hasIncome(d.metrics) && !hasFocusedCity ? null : 'none')
            .style('cursor', 'pointer')
            .on('mouseenter', function (_, d) {
                if (!hasIncome(d.metrics)) return;
                d3.select(this).attr('fill-opacity', 0.08);
            })
            .on('mouseleave', function (_, d) {
                if (!hasIncome(d.metrics)) return;
                d3.select(this).attr('fill-opacity', 0);
            })
            .on('click', (_, d) => {
                if (!hasIncome(d.metrics)) return;
                handleCardClick(d);
            })
            .each(function () {
                // keep overlay (and its outline) on top of underlying rectangles
                if (this.parentNode && this.parentNode.appendChild) {
                    this.parentNode.appendChild(this);
                }
            });

        cityGroupsMerged.select('.city-card-status')
            .attr('x', d => (d.width ?? (hasFocusedCity ? blockWidth : baseBlockWidth)) / 2)
            .text(d => hasIncome(d.metrics) ? '' : 'No data')
            .style('display', d => hasIncome(d.metrics) ? 'none' : null);

        cityGroupsMerged.select('.city-card-tooltips')
            .attr('transform', `translate(0, ${blockHeight + 12})`)
            .style('display', 'none')
            .selectAll('.tooltip-pill')
            .remove();

        if (hasFocusedCity && this.focusChartGroup && typeof this.focusChartGroup.raise === 'function') {
            this.focusChartGroup.raise();
        }

        if (this.cardGroup && typeof this.cardGroup.raise === 'function') {
            this.cardGroup.raise();
        }

        if (this.focusCityLabel && typeof this.focusCityLabel.raise === 'function') {
            this.focusCityLabel.raise();
        }

        if (this.backButtonGroup && typeof this.backButtonGroup.raise === 'function') {
            this.backButtonGroup.raise();
        }

        if (this.focusMarker) {
            this.focusMarker.style('opacity', 0);
        }

        if (cityEntries.length === 0) {
            this.svg.append('text')
                .attr('class', 'vis-no-selection text-muted')
                .attr('x', this.width / 2)
                .attr('y', this.height / 2)
                .attr('text-anchor', 'middle')
                .attr('font-size', 18)
                .text('Select a city to view data.');
        }
    }

    computeCityMetricsForYear(city, year) {
        if (!city || !Number.isFinite(year)) {
            return null;
        }
        const rentTypeOrder = ['rent'];
        const rentValues = rentTypeOrder.map(type => {
            const stats = this.getRentStats(city, year, type);
            return Number.isFinite(stats.value) ? stats.value : null;
        });
        const incomeStats = this.getIncomeStats(city, year, this.selectedHousehold);
        const incomeValue = Number.isFinite(incomeStats.value) ? incomeStats.value : null;
        const hasRent = rentValues.some(value => Number.isFinite(value));
        if (!hasRent && !Number.isFinite(incomeValue)) {
            return null;
        }
        return { income: incomeValue, rent: rentValues };
    }

    findNearestAvailableYear(city, targetYear) {
        if (!city || !Number.isFinite(targetYear)) {
            return null;
        }
        const candidates = this.getYearsForCity(city);
        if (!candidates.length) {
            return null;
        }
        const rounded = Math.round(targetYear);
        let best = null;
        let bestDiff = Infinity;
        candidates.forEach(year => {
            const diff = Math.abs(year - rounded);
            if (diff < bestDiff) {
                bestDiff = diff;
                best = year;
            }
        });
        return best;
    }

    handleFocusBandClick(event) {
        if (!this.focusedCity || !this.xScale || !this.svg) {
            return;
        }
        const [mouseX] = d3.pointer(event, this.svg.node());
        if (!Number.isFinite(mouseX)) {
            return;
        }
        const rawYear = this.xScale.invert(mouseX);
        const nearestYear = this.findNearestAvailableYear(this.focusedCity, rawYear);
        if (!Number.isFinite(nearestYear)) {
            return;
        }
        if (nearestYear === this.selectedYear) {
            if (this.secondaryFocusYear !== null) {
                this.secondaryFocusYear = null;
                this.update();
            }
            return;
        }
        if (nearestYear === this.secondaryFocusYear) {
            this.secondaryFocusYear = null;
            this.update();
            return;
        }
        this.secondaryFocusYear = nearestYear;
        this.update();
    }

    handleHoverMove(event) {
        if (!this.focusedCity || !this.xScale || !this.focusMarker || !this.svg) {
            this.hideHoverMarker();
            return;
        }
        const [mouseX] = d3.pointer(event, this.svg.node());
        if (!Number.isFinite(mouseX)) {
            this.hideHoverMarker();
            return;
        }
        const rawYear = this.xScale.invert(mouseX);
        const nearestYear = this.findNearestAvailableYear(this.focusedCity, rawYear);
        if (!Number.isFinite(nearestYear)) {
            this.hideHoverMarker();
            return;
        }
        const xPos = this.xScale(nearestYear);
        this.focusMarker
            .attr('x1', xPos)
            .attr('x2', xPos)
            .style('opacity', 0.7);
        if (typeof this.focusMarker.raise === 'function') {
            this.focusMarker.raise();
        }
        if (this.backButtonGroup && typeof this.backButtonGroup.raise === 'function') {
            this.backButtonGroup.raise();
        }
    }

    hideHoverMarker() {
        if (this.focusMarker) {
            this.focusMarker.style('opacity', 0);
        }
    }

    buildFocusSeries(cityName) {
        if (!cityName) {
            return [];
        }

        const years = this.availableYears.length
            ? this.availableYears
            : (Number.isFinite(this.selectedYear) ? [this.selectedYear] : []);

        if (!years.length) {
            return [];
        }

        const rentRenderOrder = ['rent'];
        const activeTypes = rentRenderOrder;

        const incomeSeries = years.map(year => {
            const stats = this.getIncomeStats(cityName, year, this.selectedHousehold);
            const value = Number.isFinite(stats.value) ? stats.value : null;
            return { year, value };
        });

        const series = [];
        if (incomeSeries.some(entry => Number.isFinite(entry.value))) {
            series.push({
                key: 'income',
                label: this.seriesLabels.income,
                values: incomeSeries
            });
        }

        activeTypes.forEach(type => {
            const rentSeries = years.map(year => {
                const stats = this.getRentStats(cityName, year, type);
                const value = Number.isFinite(stats.value) ? stats.value : null;
                return { year, value };
            });
            if (rentSeries.some(entry => Number.isFinite(entry.value))) {
                series.push({
                    key: type,
                    label: this.seriesLabels[type],
                    values: rentSeries
                });
            }
        });

        return series;
    }

    buildTooltipDisplayData(cityName, year, blockWidth) {
        if (!cityName || !Number.isFinite(year)) {
            return [];
        }

        const rentTypeOrder = ['rent'];
        const activeTypes = rentTypeOrder;

        const items = [];

        activeTypes.forEach(type => {
            const stats = this.getRentStats(cityName, year, type);
            if (!Number.isFinite(stats.value)) {
                return;
            }
            items.push({
                key: type,
                label: this.seriesTooltipLabels[type] || type,
                value: Math.round(stats.value),
                color: this.seriesColors[type],
                textColor: '#111827'
            });
        });

        const incomeStats = this.getIncomeStats(cityName, year, this.selectedHousehold);
        if (Number.isFinite(incomeStats.value)) {
            items.push({
                key: 'income',
                label: this.seriesTooltipLabels.income,
                value: Math.round(incomeStats.value),
                color: this.seriesColors.income,
                textColor: '#111827'
            });
        }

        const formatted = [];
        const spacing = 6;
        let offsetY = 0;

        const narrowedWidth = (() => {
            if (!Number.isFinite(blockWidth)) {
                return 90;
            }
            const shrinkCandidate = Math.min(blockWidth - 12, blockWidth * 0.85);
            const safeMinimum = Math.min(blockWidth, Math.max(48, blockWidth * 0.6));
            const width = Math.max(shrinkCandidate, safeMinimum);
            return Math.max(1, Math.min(width, blockWidth));
        })();

        items.forEach(item => {
            const valueText = item.value.toLocaleString();
            const text = `$${valueText}`;
            const height = 28;
            formatted.push({
                key: item.key,
                text,
                color: item.color,
                width: Math.round(narrowedWidth),
                height,
                offsetY,
                value: item.value,
                textColor: item.textColor
            });
            offsetY += height + spacing;
        });

        return formatted;
    }

    toggleCityFocus(cityName) {
        if (!cityName) {
            this.focusedCity = null;
            this.secondaryFocusYear = null;
            this.update();
            return;
        }
        if (this.focusedCity === cityName) {
            if (this.secondaryFocusYear !== null) {
                this.secondaryFocusYear = null;
            } else {
                this.focusedCity = null;
            }
        } else {
            this.focusedCity = cityName;
            this.secondaryFocusYear = null;
        }
        this.update();
    }
}

class RentInfo {
    constructor(config) {
        this.config = config || {};
        this.container = d3.select(this.config.parentElement);
        this.legendContainer = this.config.legendElement ? d3.select(this.config.legendElement) : null;
        this.content = null;
        this.defaultRentTypes = ['rent'];
        this.seriesColors = this.config.seriesColors || null;
        this.tooltipLabels = this.config.tooltipLabels || null;
        this.defaultLabels = this.config.defaultLabels || {
            rent: 'Rent'
        };
        this.legendLabels = this.config.legendLabels || null;
        this.lastPrimaryKey = null;
        this.lastComparisonKey = null;
    }

    init() {
        if (!this.container || this.container.empty()) {
            console.warn('RentInfo: container not found.');
            return;
        }

        this.container.classed('rent-info-container', true);

        this.content = this.container
            .append('div')
            .attr('class', 'rent-info-wrapper')
            .style('max-width', '240px')
            .style('margin', '0 auto');

        this.inner = this.content
            .append('div')
            .attr('class', 'rent-info-content')
            .style('width', '100%');

        this.update(null);
    }

    setLegendSources(seriesColors, tooltipLabels, legendLabels) {
        if (seriesColors) {
            this.seriesColors = seriesColors;
        }
        if (tooltipLabels) {
            this.tooltipLabels = tooltipLabels;
        }
        if (legendLabels) {
            this.legendLabels = legendLabels;
        }
    }

    update(payload) {
        if (!this.inner) {
            return;
        }

        // Clear legend container separately so it can live outside the info box
        const legendRoot = this.legendContainer && !this.legendContainer.empty()
            ? this.legendContainer
            : null;
        if (legendRoot) {
            legendRoot.selectAll('*').remove();
        }

        this.inner.selectAll('*').remove();

        const legendItems = [
            { type: 'income', label: this.legendLabels?.income || this.tooltipLabels?.income || this.defaultLabels?.income || 'Income', color: this.seriesColors?.income },
            { type: 'rent', label: this.legendLabels?.rent || this.tooltipLabels?.rent || this.defaultLabels?.rent || 'Rent', color: this.seriesColors?.rent }
        ].filter(item => item.color);

        const renderLegend = root => {
            if (!root || !legendItems.length) return;
            const legendCard = root.append('div')
                .attr('class', 'rent-info-legend-card rent-info-card d-flex flex-column align-items-center text-center w-100');

            const legendRow = legendCard.append('div')
                .attr('class', 'rent-info-legend d-flex flex-wrap justify-content-center align-items-center gap-3');

            const legendEntries = legendRow.selectAll('.rent-info-legend-item')
                .data(legendItems)
                .enter()
                .append('span')
                .attr('class', 'rent-info-legend-item d-flex align-items-center gap-2');

            legendEntries.append('span')
                .attr('class', 'rent-info-legend-swatch')
                .style('background-color', d => d.color)
                .style('width', '32px')
                .style('height', '14px')
                .style('border-radius', '6px');

            legendEntries.append('span')
                .attr('class', 'rent-info-legend-text')
                .text(d => d.label);
        };

        if (legendRoot) {
            renderLegend(legendRoot);
        } else {
            const legendWrapper = this.inner.append('div')
                .attr('class', 'rent-info-legend-wrapper d-flex flex-column align-items-center text-center w-100');
            renderLegend(legendWrapper);
        }

        const appendCard = (parent, title, lines, extraClass = '', options = {}) => {
            const classes = ['rent-info-card'];
            if (extraClass) {
                classes.push(extraClass);
            }
            const card = parent.append('div').attr('class', classes.join(' '));
            if (title) {
                card.append('div')
                    .attr('class', 'rent-info-card-title')
                    .text(title);
            }
            lines.forEach(line => {
                card.append('p').text(line);
            });
            if (options.flash) {
                card.classed('flash', true);
                setTimeout(() => card.classed('flash', false), 400);
            }
            return card;
        };

        if (!payload || !payload.city || !payload.primary) {
            this.lastPrimaryKey = null;
            this.lastComparisonKey = null;
            const promptWrapper = this.inner.append('div').attr('class', 'rent-info-legend-wrapper d-flex flex-column align-items-center text-center w-100');
            promptWrapper.append('p')
                .attr('class', 'graph-prompt-title')
                .text('No city selected');
            promptWrapper.append('p')
                .attr('class', 'text-muted')
                .text('Click on a city\'s rectangle to visualise the income and rent data of that city over time.');

            return;
        }

        const row = this.inner.append('div').attr('class', 'graph-prompt-row');

        const city = payload.city;
        const familyLabel = payload.familyType;
        const primaryYear = Number.isFinite(payload.primary.year) ? payload.primary.year : null;
        const primaryMetrics = payload.primary.metrics || {};
        const comparison = payload.comparison && payload.comparison.metrics ? payload.comparison : null;

        const rentTypeOrder = Array.isArray(payload.rentTypeOrder) && payload.rentTypeOrder.length
            ? payload.rentTypeOrder
            : this.defaultRentTypes;
        const activeRentTypes = Array.isArray(payload.activeRentTypes) && payload.activeRentTypes.length
            ? rentTypeOrder.filter(type => payload.activeRentTypes.includes(type))
            : rentTypeOrder;
        const tooltipLabels = payload.tooltipLabels || this.tooltipLabels || {};

        const rentIndex = new Map(rentTypeOrder.map((type, index) => [type, index]));
        const getRentValue = (metrics, type) => {
            const index = rentIndex.get(type);
            if (index === undefined || !metrics || !Array.isArray(metrics.rent)) {
                return null;
            }
            const value = metrics.rent[index];
            const numeric = Number(value);
            return Number.isFinite(numeric) ? numeric : null;
        };

        const moneyFormatter = d3.format(',.0f');
        const percentFormatter = d3.format('.1f');
        const formatMoney = value => `$${moneyFormatter(Math.round(value))}`;
        const formatPercent = value => `${percentFormatter(value)}%`;
        const yearText = primaryYear !== null ? primaryYear : 'the selected year';

        const primaryLines = [];
        const primaryKey = primaryYear !== null
            ? `${city}::${familyLabel}::${primaryYear}::${activeRentTypes.join('|')}`
            : null;
        const comparisonYear = Number.isFinite(comparison?.year) ? comparison.year : null;
        const comparisonKey = comparisonYear !== null
            ? `${city}::${familyLabel}::${comparisonYear}::${activeRentTypes.join('|')}`
            : null;
        const primaryChanged = primaryKey !== this.lastPrimaryKey;
        const comparisonChanged = comparisonKey !== this.lastComparisonKey;

        const computeShare = (incomeVal, metrics) => {
            if (!Number.isFinite(incomeVal) || !metrics || !Array.isArray(metrics.rent) || incomeVal === 0) {
                return null;
            }
            const rents = activeRentTypes
                .map(type => getRentValue(metrics, type))
                .filter(v => Number.isFinite(v));
            if (!rents.length) return null;
            return d3.mean(rents.map(r => (r / incomeVal) * 100));
        };

        const incomeValue = Number.isFinite(primaryMetrics.income) ? primaryMetrics.income : null;
        const incomeAvailable = incomeValue !== null;

        if (incomeAvailable) {
            primaryLines.push(`Income: ${formatMoney(incomeValue)} / mo (${yearText})`);
        } else {
            primaryLines.push(`Income: unavailable (${yearText})`);
        }

        if (!activeRentTypes.length) {
            primaryLines.push('No rent types selected.');
        }

        const primaryShare = computeShare(incomeValue, primaryMetrics);

        activeRentTypes.forEach(type => {
            const label = tooltipLabels[type] || type;
            const rentValue = getRentValue(primaryMetrics, type);

            if (Number.isFinite(rentValue)) {
                primaryLines.push(`${label}: ${formatMoney(rentValue)}`);
            } else {
                primaryLines.push(`${label}: no rent data`);
            }
        });

        if (Number.isFinite(primaryShare)) {
            primaryLines.unshift(`Income share: ${formatPercent(primaryShare)}`);
        }

        const hasComparison = Boolean(comparison);

        if (!hasComparison) {
            appendCard(row, `${familyLabel} in ${city} (${yearText})`, primaryLines, 'rent-info-card-primary', { flash: primaryChanged });
            appendCard(row, 'Add a comparison year', [
                'Click on the chart to compare metrics between the selected year and another year.'
            ], 'rent-info-card-empty');
            appendCard(row, 'Change summary', [
                'Select a comparison year to see how incomes and rents change between years.'
            ], 'rent-info-card-empty');
            this.lastPrimaryKey = primaryKey;
            this.lastComparisonKey = null;
            return;
        }

        const comparisonYearText = comparisonYear !== null ? comparisonYear : 'the comparison year';
        const comparisonMetrics = comparison.metrics;
        const comparisonIncome = Number.isFinite(comparisonMetrics.income) ? comparisonMetrics.income : null;

        const comparisonDetailLines = [];
        if (Number.isFinite(comparisonIncome)) {
            comparisonDetailLines.push(`Income: ${formatMoney(comparisonIncome)} / mo (${comparisonYearText})`);
        } else {
            comparisonDetailLines.push(`Income: unavailable (${comparisonYearText})`);
        }

        if (!activeRentTypes.length) {
            comparisonDetailLines.push('No rent types selected.');
        }

        const comparisonShare = computeShare(comparisonIncome, comparisonMetrics);

        activeRentTypes.forEach(type => {
            const label = tooltipLabels[type] || type;
            const rentValue = getRentValue(comparisonMetrics, type);
            if (Number.isFinite(rentValue)) {
                comparisonDetailLines.push(`${label}: ${formatMoney(rentValue)}`);
            } else {
                comparisonDetailLines.push(`${label}: no rent data`);
            }
        });

        if (Number.isFinite(comparisonShare)) {
            comparisonDetailLines.unshift(`Income share: ${formatPercent(comparisonShare)} `);
        }

        const hasBothYears = Number.isFinite(primaryYear) && Number.isFinite(comparisonYear);
        const earlierIsPrimary = !hasBothYears || primaryYear <= comparisonYear;
        const earlierYearValue = hasBothYears ? Math.min(primaryYear, comparisonYear) : primaryYear;
        const laterYearValue = hasBothYears ? Math.max(primaryYear, comparisonYear) : comparisonYear;
        const earlierYearText = Number.isFinite(earlierYearValue) ? earlierYearValue : yearText;
        const laterYearText = Number.isFinite(laterYearValue) ? laterYearValue : comparisonYearText;

        const earlierMetrics = earlierIsPrimary ? primaryMetrics : comparisonMetrics;
        const laterMetrics = earlierIsPrimary ? comparisonMetrics : primaryMetrics;
        const earlierIncome = Number.isFinite(earlierMetrics?.income) ? earlierMetrics.income : null;
        const laterIncome = Number.isFinite(laterMetrics?.income) ? laterMetrics.income : null;

        const changeLines = [];

        if (Number.isFinite(earlierIncome) && Number.isFinite(laterIncome) && earlierIncome !== 0) {
            const changePercent = ((laterIncome - earlierIncome) / earlierIncome) * 100;
            const verb = changePercent > 0 ? '▲' : '▼';
            changeLines.push(`Income: ${verb} ${formatPercent(Math.abs(changePercent))} (${earlierYearText} → ${laterYearText})`);
        } else if (Number.isFinite(earlierIncome) && !Number.isFinite(laterIncome)) {
            changeLines.push(`Income: missing for ${laterYearText}`);
        } else if (!Number.isFinite(earlierIncome) && Number.isFinite(laterIncome)) {
            changeLines.push(`Income: missing for ${earlierYearText}`);
        } else {
            changeLines.push('Income change: unavailable');
        }

        if (!activeRentTypes.length) {
            changeLines.push('No apartment types are currently selected.');
        }

        activeRentTypes.forEach(type => {
            const label = tooltipLabels[type] || type;
            const earlierValue = getRentValue(earlierMetrics, type);
            const laterValue = getRentValue(laterMetrics, type);

            if (Number.isFinite(earlierValue) && Number.isFinite(laterValue) && earlierValue !== 0) {
                const changePercent = ((laterValue - earlierValue) / earlierValue) * 100;
                const verb = changePercent > 0 ? '▲' : '▼';
                changeLines.push(`${label}: ${verb} ${formatPercent(Math.abs(changePercent))} (${earlierYearText} → ${laterYearText})`);
            } else if (!Number.isFinite(earlierValue) && Number.isFinite(laterValue)) {
                changeLines.push(`${label}: missing ${earlierYearText}`);
            } else if (Number.isFinite(earlierValue) && !Number.isFinite(laterValue)) {
                changeLines.push(`${label}: missing ${laterYearText}`);
            } else {
                changeLines.push(`${label}: change unavailable`);
            }
        });

        const earlierShare = computeShare(earlierIncome, earlierMetrics);
        const laterShare = computeShare(laterIncome, laterMetrics);
        if (Number.isFinite(earlierShare) && Number.isFinite(laterShare) && earlierShare !== 0) {
            const shareChange = ((laterShare - earlierShare) / earlierShare) * 100;
            const verb = shareChange > 0 ? '▲' : '▼';
            changeLines.unshift(`Income share: ${verb} ${formatPercent(Math.abs(shareChange))}`);
        }

        appendCard(row, `${familyLabel} in ${city} (${yearText})`, primaryLines, 'rent-info-card-primary', { flash: primaryChanged });
        appendCard(row, `${familyLabel} in ${city} (${comparisonYearText})`, comparisonDetailLines, 'rent-info-card-secondary', { flash: comparisonChanged });
        appendCard(row, `Change from ${earlierYearText} to ${laterYearText}`, changeLines, 'rent-info-card-change', { flash: (primaryChanged || comparisonChanged) });
        this.lastPrimaryKey = primaryKey;
        this.lastComparisonKey = comparisonKey;
    }
}

class Caption {
    constructor(config) {
        this.config = config;
        this.container = d3.select(this.config.parentElement);
        this.text = this.config.text;
        this.rentData = this.config.rentData;
        this.incomeData = this.config.incomeData;
        this.controls = {};
        this.onCityChange = typeof this.config.onCityChange === 'function' ? this.config.onCityChange : () => { };
        this.onHouseholdChange = typeof this.config.onHouseholdChange === 'function' ? this.config.onHouseholdChange : () => { };
    }

    init() {
        const { cities, households } = this.collectOptions();
        this.createCaption(cities, households);
        this.handleCityChange(cities);
    }

    collectOptions() {
        const cities = Array.from(new Set(this.incomeData.map(d => d.city))).sort();
        const households = Array.from(new Set(this.incomeData.map(d => d.familyType))).sort();
        return { cities, households };
    }

    createCaption(cities, households) {
        const container = this.container;

        if (this.text) {
            container.append('span')
                .attr('class', 'fw-semibold me-2')
                .text(this.text);
        }

        container.append('span').text('Compare affordability across all cities for ');
        const householdDropdown = createDropdown(households, 'Select household type', container, {
            initialSelected: households[0] || null,
            onChange: selected => this.handleHouseholdChange(selected)
        });

        container.append('span').text(' earning the typical local income.');

        this.controls = { householdDropdown };
    }

    handleCityChange(selectedCities) {
        this.onCityChange(selectedCities);
    }

    handleHouseholdChange(selectedHousehold) {
        this.onHouseholdChange(selectedHousehold);
    }
}

class Slider {
    constructor(config) {
        this.config = config;
        this.container = d3.select(this.config.parentElement);
        this.min = 2000;
        this.max = 2023;
        this.onChange = typeof this.config.onChange === 'function' ? this.config.onChange : () => { };
        const initialYear = Number(this.config.initialYear);
        this.currentYear = Number.isFinite(initialYear) ? initialYear : this.max;
        if (this.currentYear < this.min) {
            this.currentYear = this.min;
        }
        if (this.currentYear > this.max) {
            this.currentYear = this.max;
        }
        this.sliderInput = null;
        this.valueDisplay = null;
    }
    init() {
        if (this.container.empty()) {
            console.error(`Slider: parent element '${this.config.parentElement}' not found.`);
            return;
        }

        const wrapper = this.container.append('div')
            .attr('class', 'year-slider d-flex align-items-center justify-content-center gap-3 mt-2 flex-wrap mx-auto px-3')
            .style('max-width', '900px')
            .style('width', '100%');

        wrapper.append('span')
            .attr('class', 'fw-semibold')
            .text('Year');

        this.valueDisplay = wrapper.append('span')
            .attr('class', 'badge bg-primary')
            .text(this.currentYear);

        this.sliderInput = wrapper.append('input')
            .attr('type', 'range')
            .attr('class', 'form-range flex-grow-1')
            .attr('min', this.min)
            .attr('max', this.max)
            .attr('step', 1)
            .property('value', this.currentYear)
            .on('input', event => this.handleInput(event.target.value));

        this.onChange(this.currentYear);
    }

    handleInput(value) {
        const year = Number(value);
        if (!Number.isFinite(year)) {
            return;
        }
        const clampedYear = Math.min(Math.max(year, this.min), this.max);
        this.currentYear = clampedYear;
        if (this.valueDisplay) {
            this.valueDisplay.text(clampedYear);
        }
        this.onChange(clampedYear);
    }

    setYear(year) {
        const numericYear = Number(year);
        if (!Number.isFinite(numericYear)) {
            return;
        }
        const clampedYear = Math.min(Math.max(numericYear, this.min), this.max);
        this.currentYear = clampedYear;
        if (this.sliderInput) {
            this.sliderInput.property('value', clampedYear);
        }
        if (this.valueDisplay) {
            this.valueDisplay.text(clampedYear);
        }
        this.onChange(clampedYear);
    }
}
