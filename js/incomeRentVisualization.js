const INCOME_DATA_MAP = {
    city: "GEO",
    date: "REF_DATE",
    value: "VALUE",
    familyType: "Economic family type"
};

const RENT_DATA_MAP = {
    city: "GEO",
    date: "REF_DATE",
    value: "VALUE",
    type: "Type of unit"
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

Promise.all([
    d3.csv("data/jeff/rent-prices.csv").then(rows => rows.map(row => mapRowBySchema(row, RENT_DATA_MAP))),
    d3.csv("data/jeff/u65incomedata.csv").then(rows => rows.filter(row => ['A', 'B', 'C', 'D', 'E'].includes(row.STATUS))
        .map(row => mapRowBySchema(row, INCOME_DATA_MAP)))
]).then(([rentData, incomeData]) => {
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

    const vis = new IncomeRentComparison({
        parentElement: "#vis4-container",
        rentData,
        incomeData,
        initialYear: maxYear
    });

    const caption = new Caption({
        parentElement: "#vis4-caption",
        text: "",
        rentData,
        incomeData,
        onCityChange: cities => vis.setCityFilter(cities),
        onHouseholdChange: household => vis.setHouseholdFilter(household)
    });

    vis.init();
    caption.init();

    const rentInfo = new RentInfo({
        parentElement: "#vis4-rentinfo"
    });

    rentInfo.init();
    vis.setRentInfo(rentInfo);

    const slider = new Slider({
        parentElement: "#vis4-slider",
        min: minYear,
        max: maxYear,
        initialYear: vis.selectedYear ?? maxYear,
        onChange: year => vis.setYear(year)
    });

    slider.init();
}).catch(error => {
    console.error("Failed to load income/rent datasets", error);
});

class IncomeRentComparison {
    constructor(config) {
        this.config = config;
        this.parentSelector = this.config.parentElement;
        this.parentElement = d3.select(this.parentSelector);
        this.rentData = this.config.rentData;
        this.incomeData = this.config.incomeData;
        this.selectedApartmentTypes = new Set(this.rentData.map(d => d.type));
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
        this.focusCityLabel = null;
        this.cardGroup = null;
        this.rentInfo = null;
        this.lineGenerator = null;
        this.focusCardFixedWidth = null;
        this.seriesColors = {
            income: '#D9D9D9',
            '0br': '#5a9216',
            '1br': '#ffc107',
            '2br': '#ff6b35',
            '3br': '#c1121f'
        };
        this.seriesLabels = {
            income: 'Monthly income',
            '0br': 'Bachelor rent',
            '1br': '1-bedroom rent',
            '2br': '2-bedroom rent',
            '3br': '3-bedroom rent'
        };
        this.seriesTooltipLabels = {
            income: 'Income',
            '0br': 'Bachelor',
            '1br': '1BR',
            '2br': '2BR',
            '3br': '3BR'
        };
        this.baseBlockWidth = 180;
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
        vis.margin = { top: 60, right: 40, bottom: 60, left: 60 };

        const containerNode = vis.parentElement.node();
        if (!containerNode) {
            console.error(`IncomeRentComparison: container '${vis.parentSelector}' not found.`);
            return;
        }

        const bounds = containerNode.getBoundingClientRect();
        const rawWidth = bounds.width - vis.margin.left - vis.margin.right;
        const rawHeight = bounds.height - vis.margin.top - vis.margin.bottom;

        vis.width = Math.max(rawWidth, 320);
        vis.height = Math.max(rawHeight, 240);

        const svgRoot = vis.parentElement.append('svg')
            .attr('width', vis.width + vis.margin.left + vis.margin.right)
            .attr('height', vis.height + vis.margin.top + vis.margin.bottom);

        vis.svg = svgRoot.append('g')
            .attr('transform', `translate(${vis.margin.left},${vis.margin.top})`);

        vis.yScale = d3.scaleLinear()
            .domain([0, 20000])
            .range([0, vis.height]);

        const yAxis = d3.axisLeft(vis.yScale)
            .ticks(6)
            .tickFormat(d3.format(','));

        vis.yAxisGroup = vis.svg.append('g')
            .attr('class', 'axis axis-y')
            .call(yAxis);

        vis.yAxisGroup.append('text')
            .attr('class', 'axis-label')
            .attr('x', -vis.margin.left + 12)
            .attr('y', -30)
            .attr('text-anchor', 'start')
            .attr('fill', '#111827')
            .attr('font-size', 12)
            .attr('font-weight', 600)
            .text('Monthly Income / Rent (CAD)');

        const xDomain = [2000, 2023];
        const xTickValues = d3.range(xDomain[0], xDomain[1] + 1);

        vis.xPadding = this.focusCardHalfWidth;

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
            .attr('stroke', '#111827')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '4 3')
            .style('opacity', 0)
            .style('pointer-events', 'none');

        vis.focusChartGroup = vis.svg.append('g')
            .attr('class', 'focus-chart')
            .style('opacity', 0)
            .style('pointer-events', 'none');

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
        this.selectedApartmentTypes = new Set(types || []);
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
                Object.entries(typeMap).forEach(([type, stats]) => {
                    yearStore[type] = {
                        value: stats.count > 0 ? stats.sum / stats.count : null,
                        count: stats.count
                    };
                });
            });
        });

        const incomeAccumulator = {};
        this.incomeData.forEach(d => {
            const city = d.city;
            const familyType = d.familyType || 'Unknown';
            const year = Number(d.date);
            const value = Number(d.value);
            if (!city || !Number.isFinite(year) || !Number.isFinite(value)) {
                return;
            }
            incomeAccumulator[city] = incomeAccumulator[city] || {};
            incomeAccumulator[city][year] = incomeAccumulator[city][year] || {};
            incomeAccumulator[city][year][familyType] = incomeAccumulator[city][year][familyType] || { sum: 0, count: 0 };
            incomeAccumulator[city][year][familyType].sum += value;
            incomeAccumulator[city][year][familyType].count += 1;
        });

        this.incomeAggregates = {};
        Object.entries(incomeAccumulator).forEach(([city, yearMap]) => {
            const cityStore = this.incomeAggregates[city] = {};
            Object.entries(yearMap).forEach(([yearKey, typeMap]) => {
                const numericYear = Number(yearKey);
                const yearStore = cityStore[numericYear] = {};
                Object.entries(typeMap).forEach(([familyType, stats]) => {
                    yearStore[familyType] = {
                        value: stats.count > 0 ? (stats.sum / stats.count) / 12 : null,
                        count: stats.count
                    };
                });
            });
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

        const aptFilterActive = this.selectedApartmentTypes.size > 0;
        const noCitySelection = this.selectedCities.size === 0;
        const yearFilterActive = Number.isFinite(this.selectedYear);

        const rentTypeOrder = ['0br', '1br', '2br', '3br'];
        const activeRentTypes = aptFilterActive
            ? rentTypeOrder.filter(type => this.selectedApartmentTypes.has(type))
            : rentTypeOrder;

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
        const gap = 20;
        const startX = 10;
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
            const padding = Math.max(this.focusCardHalfWidth, 1);
            this.xScale.range([padding, this.width - padding]);
            if (this.xAxisGroup && this.xAxis) {
                this.xAxisGroup.call(this.xAxis);
                this.xAxisGroup.select('.domain')
                    .attr('d', `M0.5,0.5H${this.width}`);
            }
        }

        const blockWidth = hasFocusedCity ? this.focusCardFixedWidth : baseBlockWidth;

        if (!hasFocusedCity && cityEntries.length > 0) {
            const totalWidth = (cityEntries.length * baseBlockWidth) + ((cityEntries.length - 1) * gap);
            const centeredX = (this.width - totalWidth) / 2;
            overviewStartX = Math.max(0, centeredX);
        }

        const computeCardLeft = year => {
            if (!hasFocusedCity || !Number.isFinite(year)) {
                return overviewStartX;
            }
            const desired = this.xScale(year) - (blockWidth / 2);
            return Math.max(0, Math.min(desired, this.width - blockWidth));
        };

        const focusLeftX = hasFocusedCity && Number.isFinite(focusYear) ? computeCardLeft(focusYear) : null;
        const focusRightX = focusLeftX !== null ? focusLeftX + blockWidth : null;

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

        this.xAxisGroup
            .style('opacity', hasFocusedCity ? 1 : 0);

        if (this.focusChartGroup) {
            const focusLeftData = [];
            const focusMiddleData = [];
            const focusRightData = [];

            if (hasFocusedCity && focusSeries.length > 0) {
                const cardsForSegments = cardData
                    .filter(card => card.kind === 'primary' || card.kind === 'comparison')
                    .filter(card => Number.isFinite(card.year))
                    .sort((a, b) => a.year - b.year);

                const hasComparisonCard = cardsForSegments.length > 1;
                const earliestCard = cardsForSegments[0] || null;
                const latestCard = cardsForSegments.length > 0
                    ? cardsForSegments[cardsForSegments.length - 1]
                    : null;
                const earliestWidth = earliestCard ? (earliestCard.width ?? blockWidth) : blockWidth;
                const latestWidth = latestCard ? (latestCard.width ?? blockWidth) : blockWidth;
                const earliestRightEdge = earliestCard ? earliestCard.leftX + earliestWidth : null;
                const latestLeftEdge = latestCard ? latestCard.leftX : null;
                const shouldRenderMiddle = hasComparisonCard
                    && earliestCard
                    && latestCard
                    && earliestCard !== latestCard
                    && latestLeftEdge !== null
                    && earliestRightEdge !== null
                    && (latestLeftEdge - earliestRightEdge) > 1;

                focusSeries.forEach(series => {
                    const color = this.seriesColors[series.key] || '#111827';
                    const values = Array.isArray(series.values) ? series.values : [];

                    const clonePoint = point => ({ ...point });
                    const findAnchor = year => values.find(
                        point => Number.isFinite(point.value) && point.year === year
                    );

                    if (earliestCard) {
                        const leftValues = values
                            .filter(point => Number.isFinite(point.value) && point.year <= earliestCard.year)
                            .map(clonePoint);

                        if (leftValues.length) {
                            const axisX = earliestCard.leftX;
                            const centerX = this.xScale ? this.xScale(earliestCard.year) : null;
                            let lastPoint = leftValues[leftValues.length - 1];
                            if (lastPoint.year !== earliestCard.year) {
                                const anchor = findAnchor(earliestCard.year);
                                if (anchor) {
                                    leftValues.push({ ...anchor });
                                    lastPoint = leftValues[leftValues.length - 1];
                                }
                            }

                            if (lastPoint.year === earliestCard.year) {
                                const axisPoint = { ...lastPoint, xOverride: axisX };
                                leftValues[leftValues.length - 1] = axisPoint;

                                const hasDistinctCenter = Number.isFinite(centerX) && Math.abs(centerX - axisX) > 0.5;
                                const centerPoint = {
                                    ...axisPoint,
                                    xOverride: hasDistinctCenter ? centerX : axisX + 0.5
                                };
                                leftValues.push(centerPoint);
                            }
                            if (leftValues.length >= 2) {
                                focusLeftData.push({ key: series.key, color, values: leftValues });
                            }
                        }
                    }

                    if (shouldRenderMiddle) {
                        const middleValues = values
                            .filter(point => Number.isFinite(point.value)
                                && point.year >= earliestCard.year
                                && point.year <= latestCard.year)
                            .map(clonePoint);

                        if (middleValues.length) {
                            let firstPoint = middleValues[0];
                            if (firstPoint.year !== earliestCard.year) {
                                const anchor = findAnchor(earliestCard.year);
                                if (anchor) {
                                    middleValues.unshift({ ...anchor });
                                    firstPoint = middleValues[0];
                                }
                            }
                            if (firstPoint.year === earliestCard.year) {
                                firstPoint.xOverride = earliestRightEdge;
                            }

                            let lastPoint = middleValues[middleValues.length - 1];
                            if (lastPoint.year !== latestCard.year) {
                                const anchor = findAnchor(latestCard.year);
                                if (anchor) {
                                    middleValues.push({ ...anchor });
                                    lastPoint = middleValues[middleValues.length - 1];
                                }
                            }
                            if (lastPoint.year === latestCard.year) {
                                lastPoint.xOverride = latestLeftEdge;
                            }

                            if (middleValues.length >= 2) {
                                focusMiddleData.push({ key: series.key, color, values: middleValues });
                            }
                        }
                    }

                    if (latestCard) {
                        const rightValues = values
                            .filter(point => Number.isFinite(point.value) && point.year >= latestCard.year)
                            .map(clonePoint);

                        if (rightValues.length) {
                            const edgeX = latestCard.leftX + latestWidth;
                            const centerX = this.xScale ? this.xScale(latestCard.year) : null;
                            let firstPoint = rightValues[0];
                            if (firstPoint.year !== latestCard.year) {
                                const anchor = findAnchor(latestCard.year);
                                if (anchor) {
                                    rightValues.unshift({ ...anchor });
                                    firstPoint = rightValues[0];
                                }
                            }

                            if (firstPoint.year === latestCard.year) {
                                const hasDistinctCenter = Number.isFinite(centerX) && Math.abs(centerX - edgeX) > 0.5;
                                const centerPoint = {
                                    ...firstPoint,
                                    xOverride: hasDistinctCenter ? centerX : edgeX - 0.5
                                };
                                const edgePoint = { ...firstPoint, xOverride: edgeX };
                                rightValues[0] = centerPoint;
                                rightValues.splice(1, 0, edgePoint);
                            }
                            if (rightValues.length >= 2) {
                                focusRightData.push({ key: series.key, color, values: rightValues });
                            }
                        }
                    }
                });
            }

            const active = hasFocusedCity && (
                focusLeftData.length > 0
                || focusMiddleData.length > 0
                || focusRightData.length > 0
            );
            this.focusChartGroup
                .style('opacity', active ? 1 : 0)
                .style('pointer-events', active ? 'all' : 'none');

            const leftSelection = this.focusChartLeft
                ? this.focusChartLeft.selectAll('.focus-series-left').data(focusLeftData, d => d.key)
                : null;

            if (leftSelection) {
                leftSelection.exit().remove();

                const leftEnter = leftSelection.enter()
                    .append('g')
                    .attr('class', 'focus-series-left');

                leftEnter.append('path')
                    .attr('class', 'focus-area focus-area-left');

                leftEnter.append('path')
                    .attr('class', 'focus-line focus-line-left')
                    .attr('stroke-linecap', 'round')
                    .attr('stroke-linejoin', 'round');

                const leftMerged = leftEnter.merge(leftSelection);

                leftMerged.select('.focus-area-left')
                    .attr('fill', d => d.color)
                    .attr('stroke', 'none')
                    .attr('fill-opacity', 1)
                    .attr('d', d => this.areaGenerator ? this.areaGenerator(d.values) : null)
                    .style('pointer-events', 'all')
                    .style('cursor', 'pointer')
                    .on('click', event => this.handleFocusBandClick(event));

                leftMerged.select('.focus-line-left')
                    .attr('fill', 'none')
                    .attr('stroke-width', 1)
                    .attr('opacity', 1)
                    .attr('stroke', d => d.color)
                    .attr('d', d => this.lineGenerator ? this.lineGenerator(d.values) : null)
                    .style('pointer-events', 'stroke')
                    .style('cursor', 'pointer')
                    .on('click', event => this.handleFocusBandClick(event));

                if (this.focusChartLeft) {
                    this.focusChartLeft.selectAll('.focus-series-left').order();
                }
            }

            const middleSelection = this.focusChartCenter
                ? this.focusChartCenter.selectAll('.focus-series-middle').data(focusMiddleData, d => d.key)
                : null;

            if (middleSelection) {
                middleSelection.exit().remove();

                const middleEnter = middleSelection.enter()
                    .append('g')
                    .attr('class', 'focus-series-middle');

                middleEnter.append('path')
                    .attr('class', 'focus-area focus-area-middle');

                middleEnter.append('path')
                    .attr('class', 'focus-line focus-line-middle')
                    .attr('stroke-linecap', 'round')
                    .attr('stroke-linejoin', 'round');

                const middleMerged = middleEnter.merge(middleSelection);

                middleMerged.select('.focus-area-middle')
                    .attr('fill', d => d.color)
                    .attr('stroke', 'none')
                    .attr('fill-opacity', 1)
                    .attr('d', d => this.areaGenerator ? this.areaGenerator(d.values) : null)
                    .style('pointer-events', 'all')
                    .style('cursor', 'pointer')
                    .on('click', event => this.handleFocusBandClick(event));

                middleMerged.select('.focus-line-middle')
                    .attr('fill', 'none')
                    .attr('stroke-width', 1)
                    .attr('opacity', 1)
                    .attr('stroke', d => d.color)
                    .attr('d', d => this.lineGenerator ? this.lineGenerator(d.values) : null)
                    .style('pointer-events', 'stroke')
                    .style('cursor', 'pointer')
                    .on('click', event => this.handleFocusBandClick(event));

                if (this.focusChartCenter) {
                    this.focusChartCenter.selectAll('.focus-series-middle').order();
                }
            }

            const rightSelection = this.focusChartRight
                ? this.focusChartRight.selectAll('.focus-series-right').data(focusRightData, d => d.key)
                : null;

            if (rightSelection) {
                rightSelection.exit().remove();

                const rightEnter = rightSelection.enter()
                    .append('g')
                    .attr('class', 'focus-series-right');

                rightEnter.append('path')
                    .attr('class', 'focus-area focus-area-right');

                rightEnter.append('path')
                    .attr('class', 'focus-line focus-line-right')
                    .attr('stroke-linecap', 'round')
                    .attr('stroke-linejoin', 'round');

                const rightMerged = rightEnter.merge(rightSelection);

                rightMerged.select('.focus-area-right')
                    .attr('fill', d => d.color)
                    .attr('stroke', 'none')
                    .attr('fill-opacity', 1)
                    .attr('d', d => this.areaGenerator ? this.areaGenerator(d.values) : null)
                    .style('pointer-events', 'all')
                    .style('cursor', 'pointer')
                    .on('click', event => this.handleFocusBandClick(event));

                rightMerged.select('.focus-line-right')
                    .attr('fill', 'none')
                    .attr('stroke-width', 1)
                    .attr('opacity', 1)
                    .attr('stroke', d => d.color)
                    .attr('d', d => this.lineGenerator ? this.lineGenerator(d.values) : null)
                    .style('pointer-events', 'stroke')
                    .style('cursor', 'pointer')
                    .on('click', event => this.handleFocusBandClick(event));

                if (this.focusChartRight) {
                    this.focusChartRight.selectAll('.focus-series-right').order();
                }
            }

            if (active && typeof this.focusChartGroup.raise === 'function') {
                this.focusChartGroup.raise();
            }
        }

        const cardRoot = this.cardGroup || this.svg;
        const cityGroups = cardRoot.selectAll('.city-card')
            .data(cardData, d => d.key);

        cityGroups.exit().remove();

        this.svg.selectAll('.vis-no-selection').remove();

        const cityGroupsEnter = cityGroups.enter()
            .append('g')
            .attr('class', 'city-card');

        cityGroupsEnter.append('rect')
            .attr('class', 'city-card-bg')
            .attr('width', blockWidth)
            .attr('height', blockHeight)
            .attr('fill', this.seriesColors.income)
            .attr('stroke', '#000000')
            .attr('stroke-width', 1);

        cityGroupsEnter.append('rect')
            .attr('class', 'threebr-block')
            .attr('width', blockWidth)
            .attr('height', blockHeight)
            .attr('fill', this.seriesColors['3br'])
            .attr('stroke', '#000000')
            .attr('stroke-width', 1);
        cityGroupsEnter.append('rect')
            .attr('class', 'twobr-block')
            .attr('width', blockWidth)
            .attr('height', blockHeight)
            .attr('fill', this.seriesColors['2br'])
            .attr('stroke', '#000000')
            .attr('stroke-width', 1);
        cityGroupsEnter.append('rect')
            .attr('class', 'onebr-block')
            .attr('width', blockWidth)
            .attr('height', blockHeight)
            .attr('fill', this.seriesColors['1br'])
            .attr('stroke', '#000000')
            .attr('stroke-width', 1);
        cityGroupsEnter.append('rect')
            .attr('class', 'bachelor-block')
            .attr('width', blockWidth)
            .attr('height', blockHeight)
            .attr('fill', this.seriesColors['0br'])
            .attr('stroke', '#000000')
            .attr('stroke-width', 1);

        cityGroupsEnter.append('text')
            .attr('class', 'city-card-label')
            .attr('x', blockWidth / 2)
            .attr('y', -24)
            .attr('text-anchor', 'middle')
            .attr('fill', '#1f2937')
            .attr('font-weight', '600')
            .attr('font-size', 14);

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

        cityGroupsMerged
            .attr('transform', (d, i) => {
                const cardWidth = d.width ?? (hasFocusedCity ? blockWidth : baseBlockWidth);
                const left = Number.isFinite(d.leftX) ? d.leftX : (startX + i * (cardWidth + gap));
                return `translate(${left}, ${startY})`;
            })
            .style('cursor', 'pointer')
            .classed('is-focused', d => hasFocusedCity && d.kind === 'primary')
            .classed('is-secondary', d => hasFocusedCity && d.kind === 'comparison')
            .classed('is-hovered', false)
            .on('mouseenter', function () {
                if (!hasFocusedCity) {
                    d3.select(this).classed('is-hovered', true);
                }
            })
            .on('mouseleave', function () {
                if (!hasFocusedCity) {
                    d3.select(this).classed('is-hovered', false);
                }
            })
            .on('click', (_, d) => {
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
            });

        if (hasFocusedCity) {
            cityGroupsMerged.classed('is-hovered', false);
        }

        const hasIncome = metrics => metrics && Number.isFinite(metrics.income);
        const incomeHeight = metrics => hasIncome(metrics) ? this.yScale(metrics.income) : 0;
        const rentHeight = (metrics, index) => {
            if (!metrics || !Array.isArray(metrics.rent)) {
                return 0;
            }
            const value = metrics.rent[index];
            return Number.isFinite(value) ? this.yScale(value) : 0;
        };

        cityGroupsMerged.select('.city-card-label')
            .attr('x', d => (d.width ?? (hasFocusedCity ? blockWidth : baseBlockWidth)) / 2)
            .text(d => d.city)
            .style('display', hasFocusedCity ? 'none' : null);

        cityGroupsMerged.select('.city-card-bg')
            .attr('width', d => d.width ?? (hasFocusedCity ? blockWidth : baseBlockWidth))
            .attr('height', d => incomeHeight(d.metrics))
            .style('display', d => hasIncome(d.metrics) ? null : 'none');

        cityGroupsMerged.select('.bachelor-block')
            .attr('width', d => d.width ?? (hasFocusedCity ? blockWidth : baseBlockWidth))
            .attr('height', d => rentHeight(d.metrics, 0))
            .style('display', d => hasIncome(d.metrics) ? null : 'none');

        cityGroupsMerged.select('.onebr-block')
            .attr('width', d => d.width ?? (hasFocusedCity ? blockWidth : baseBlockWidth))
            .attr('height', d => rentHeight(d.metrics, 1))
            .style('display', d => hasIncome(d.metrics) ? null : 'none');

        cityGroupsMerged.select('.twobr-block')
            .attr('width', d => d.width ?? (hasFocusedCity ? blockWidth : baseBlockWidth))
            .attr('height', d => rentHeight(d.metrics, 2))
            .style('display', d => hasIncome(d.metrics) ? null : 'none');

        cityGroupsMerged.select('.threebr-block')
            .attr('width', d => d.width ?? (hasFocusedCity ? blockWidth : baseBlockWidth))
            .attr('height', d => rentHeight(d.metrics, 3))
            .style('display', d => hasIncome(d.metrics) ? null : 'none');

        cityGroupsMerged.select('.city-card-status')
            .attr('x', d => (d.width ?? (hasFocusedCity ? blockWidth : baseBlockWidth)) / 2)
            .text(d => hasIncome(d.metrics) ? '' : 'No data')
            .style('display', d => hasIncome(d.metrics) ? 'none' : null);

        cityGroupsMerged.select('.city-card-tooltips')
            .style('display', hasFocusedCity ? null : 'none');

        if (hasFocusedCity) {
            cityGroupsMerged.each((card, index, nodes) => {
                const tooltipGroup = d3.select(nodes[index]).select('.city-card-tooltips');
                if (!Number.isFinite(card.year)) {
                    tooltipGroup
                        .attr('transform', `translate(0, ${blockHeight + 12})`)
                        .style('display', 'none')
                        .selectAll('.tooltip-pill')
                        .remove();
                    return;
                }

                const cardWidth = card.width ?? (hasFocusedCity ? blockWidth : baseBlockWidth);
                const tooltipData = this.buildTooltipDisplayData(card.city, card.year, cardWidth);
                if (!tooltipData.length) {
                    tooltipGroup
                        .attr('transform', `translate(0, ${blockHeight + 12})`)
                        .style('display', 'none')
                        .selectAll('.tooltip-pill')
                        .remove();
                    return;
                }

                const tooltipWidth = tooltipData[0].width;
                const maxValue = d3.max(tooltipData.map(d => d.value));
                const tooltipOffsetX = Math.max(0, (cardWidth - tooltipWidth) / 2);
                const baseY = Number.isFinite(maxValue) ? this.yScale(maxValue) : blockHeight;
                const tooltipPadding = 12;
                const tooltipHeight = d3.max(tooltipData, d => (d.offsetY ?? 0) + (d.height ?? 0)) || 0;
                const baseTranslateY = baseY + tooltipPadding;
                const maxTranslateY = this.height - tooltipHeight - tooltipPadding;
                const translateY = Math.max(tooltipPadding, Math.min(baseTranslateY, maxTranslateY));

                tooltipGroup
                    .style('display', null)
                    .attr('transform', `translate(${tooltipOffsetX}, ${translateY})`);

                const tooltipPills = tooltipGroup.selectAll('.tooltip-pill')
                    .data(tooltipData, d => d.key);

                tooltipPills.exit().remove();

                const tooltipPillsEnter = tooltipPills.enter()
                    .append('g')
                    .attr('class', 'tooltip-pill');

                tooltipPillsEnter.append('rect')
                    .attr('rx', 6)
                    .attr('ry', 6)
                    .attr('stroke', '#111827')
                    .attr('stroke-width', 0.6);

                tooltipPillsEnter.append('text')
                    .attr('text-anchor', 'middle')
                    .attr('dominant-baseline', 'middle')
                    .attr('font-size', 12)
                    .attr('font-weight', 600);

                const tooltipPillsMerged = tooltipPillsEnter.merge(tooltipPills);

                tooltipPillsMerged
                    .attr('transform', d => `translate(0, ${d.offsetY})`);

                tooltipPillsMerged.select('rect')
                    .attr('width', d => d.width)
                    .attr('height', d => d.height)
                    .attr('fill', d => d.color)
                    .attr('opacity', 0.9);

                tooltipPillsMerged.select('text')
                    .attr('x', d => d.width / 2)
                    .attr('y', d => d.height / 2)
                    .attr('fill', d => d.textColor || '#111827')
                    .text(d => d.text);

                if (typeof tooltipGroup.raise === 'function') {
                    tooltipGroup.raise();
                }
            });
        } else {
            cityGroupsMerged.select('.city-card-tooltips')
                .attr('transform', `translate(0, ${blockHeight + 12})`)
                .style('display', 'none')
                .selectAll('.tooltip-pill')
                .remove();
        }

        if (hasFocusedCity && this.focusChartGroup && typeof this.focusChartGroup.raise === 'function') {
            this.focusChartGroup.raise();
        }

        if (this.cardGroup && typeof this.cardGroup.raise === 'function') {
            this.cardGroup.raise();
        }

        if (this.focusCityLabel && typeof this.focusCityLabel.raise === 'function') {
            this.focusCityLabel.raise();
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
        const rentTypeOrder = ['0br', '1br', '2br', '3br'];
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

        const rentRenderOrder = ['3br', '2br', '1br', '0br'];
        const activeTypes = this.selectedApartmentTypes.size > 0
            ? rentRenderOrder.filter(type => this.selectedApartmentTypes.has(type))
            : rentRenderOrder;

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

        const rentTypeOrder = ['0br', '1br', '2br', '3br'];
        const activeTypes = this.selectedApartmentTypes.size > 0
            ? rentTypeOrder.filter(type => this.selectedApartmentTypes.has(type))
            : rentTypeOrder;

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
        this.content = null;
        this.defaultRentTypes = ['0br', '1br', '2br', '3br'];
        this.seriesColors = this.config.seriesColors || null;
        this.tooltipLabels = this.config.tooltipLabels || null;
        this.defaultLabels = this.config.defaultLabels || {
            '0br': 'Bachelor',
            '1br': '1 Bedroom',
            '2br': '2 Bedroom',
            '3br': '3 Bedroom'
        };
        this.legendLabels = this.config.legendLabels || null;
    }

    init() {
        if (!this.container || this.container.empty()) {
            console.warn('RentInfo: container not found.');
            return;
        }

        this.container.classed('rent-info-container', true);

        this.content = this.container
            .append('div')
            .attr('class', 'rent-info-wrapper d-flex justify-content-center');

        this.inner = this.content
            .append('div')
            .attr('class', 'rent-info-content d-flex flex-column gap-2 align-items-stretch small');

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

        this.inner.selectAll('*').remove();

        const legendItems = [
            { type: 'income', label: this.legendLabels?.income || this.tooltipLabels?.income || this.defaultLabels?.income || 'Income', color: this.seriesColors?.income },
            { type: '0br', label: this.legendLabels?.['0br'] || this.tooltipLabels?.['0br'] || this.defaultLabels?.['0br'] || 'Bachelor', color: this.seriesColors?.['0br'] },
            { type: '1br', label: this.legendLabels?.['1br'] || this.tooltipLabels?.['1br'] || this.defaultLabels?.['1br'] || '1 Bedroom', color: this.seriesColors?.['1br'] },
            { type: '2br', label: this.legendLabels?.['2br'] || this.tooltipLabels?.['2br'] || this.defaultLabels?.['2br'] || '2 Bedroom', color: this.seriesColors?.['2br'] },
            { type: '3br', label: this.legendLabels?.['3br'] || this.tooltipLabels?.['3br'] || this.defaultLabels?.['3br'] || '3 Bedroom', color: this.seriesColors?.['3br'] }
        ].filter(item => item.color);

        if (legendItems.length) {
            const legendWrapper = this.inner.append('div')
                .attr('class', 'rent-info-legend-wrapper d-flex flex-column align-items-center text-center w-100');

            legendWrapper.append('span')
                .attr('class', 'rent-info-legend-title fw-semibold text-uppercase')
                .text('Rent Types');

            const legendRow = legendWrapper.append('div')
                .attr('class', 'rent-info-legend d-flex flex-wrap justify-content-center align-items-center gap-3');

            const legendEntries = legendRow.selectAll('.rent-info-legend-item')
                .data(legendItems)
                .enter()
                .append('span')
                .attr('class', 'rent-info-legend-item d-flex align-items-center gap-2');

            legendEntries.append('span')
                .attr('class', 'rent-info-legend-swatch')
                .style('background-color', d => d.color);

            legendEntries.append('span')
                .attr('class', 'rent-info-legend-text')
                .text(d => d.label);
        }

        const appendCard = (parent, title, lines, extraClass = '') => {
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
            return card;
        };

        if (!payload || !payload.city || !payload.primary) {
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
        const familyLabel = payload.familyType || 'All households';
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

        const incomeValue = Number.isFinite(primaryMetrics.income) ? primaryMetrics.income : null;
        const incomeAvailable = incomeValue !== null;

        if (incomeAvailable) {
            primaryLines.push(`${familyLabel} living in ${city} made ${formatMoney(incomeValue)} a month on average in ${yearText}.`);
        } else {
            primaryLines.push(`Income data for ${familyLabel} living in ${city} in ${yearText} is unavailable.`);
        }

        if (!activeRentTypes.length) {
            primaryLines.push('No apartment types are currently selected.');
        }

        activeRentTypes.forEach(type => {
            const label = tooltipLabels[type] || type;
            const rentValue = getRentValue(primaryMetrics, type);

            if (Number.isFinite(rentValue) && incomeAvailable && incomeValue > 0) {
                const percent = (rentValue / incomeValue) * 100;
                primaryLines.push(`They would pay ${formatPercent(percent)} of their income to afford ${label} rent.`);
            } else if (Number.isFinite(rentValue)) {
                primaryLines.push(`Rent for ${label} was ${formatMoney(rentValue)} in ${yearText}, but income data is unavailable for this calculation.`);
            } else {
                primaryLines.push(`Rent data for ${label} in ${yearText} is unavailable.`);
            }
        });

        const hasComparison = Boolean(comparison);

        if (!hasComparison) {
            appendCard(row, `${familyLabel} in ${city} (${yearText})`, primaryLines, 'rent-info-card-primary');
            appendCard(row, 'Add a comparison year', [
                'Click on the chart to compare metrics between the selected year and another year.'
            ], 'rent-info-card-empty');
            appendCard(row, 'Change summary', [
                'Select a comparison year to see how incomes and rents change between years.'
            ], 'rent-info-card-empty');
            return;
        }

        const comparisonYear = Number.isFinite(comparison.year) ? comparison.year : null;
        const comparisonYearText = comparisonYear !== null ? comparisonYear : 'the comparison year';
        const comparisonMetrics = comparison.metrics;
        const comparisonIncome = Number.isFinite(comparisonMetrics.income) ? comparisonMetrics.income : null;

        const comparisonDetailLines = [];
        if (Number.isFinite(comparisonIncome)) {
            comparisonDetailLines.push(`${familyLabel} living in ${city} made ${formatMoney(comparisonIncome)} in ${comparisonYearText}.`);
        } else {
            comparisonDetailLines.push(`Income data for ${familyLabel} living in ${city} in ${comparisonYearText} is unavailable.`);
        }

        if (!activeRentTypes.length) {
            comparisonDetailLines.push('No apartment types are currently selected.');
        }

        activeRentTypes.forEach(type => {
            const label = tooltipLabels[type] || type;
            const rentValue = getRentValue(comparisonMetrics, type);

            if (Number.isFinite(rentValue) && Number.isFinite(comparisonIncome) && comparisonIncome > 0) {
                const percent = (rentValue / comparisonIncome) * 100;
                comparisonDetailLines.push(`They would pay ${formatPercent(percent)} of their income to afford ${label} rent.`);
            } else if (Number.isFinite(rentValue)) {
                comparisonDetailLines.push(`Rent for ${label} was ${formatMoney(rentValue)} in ${comparisonYearText}, but income data is unavailable for this calculation.`);
            } else {
                comparisonDetailLines.push(`Rent data for ${label} in ${comparisonYearText} is unavailable.`);
            }
        });

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
            if (Math.abs(changePercent) < 0.05) {
                changeLines.push(`Incomes for ${familyLabel} did not change between ${earlierYearText} and ${laterYearText}.`);
            } else {
                const verb = changePercent > 0 ? 'increased' : 'decreased';
                changeLines.push(`Incomes for ${familyLabel} ${verb} by ${formatPercent(Math.abs(changePercent))} from ${earlierYearText} to ${laterYearText}.`);
            }
        } else if (Number.isFinite(earlierIncome) && Number.isFinite(laterIncome) && earlierIncome === 0) {
            changeLines.push(`Incomes for ${familyLabel} cannot be compared because income in ${earlierYearText} is zero.`);
        } else if (!Number.isFinite(earlierIncome) && Number.isFinite(laterIncome)) {
            changeLines.push(`Income change between ${earlierYearText} and ${laterYearText} is unavailable because ${earlierYearText} income is missing.`);
        } else if (Number.isFinite(earlierIncome) && !Number.isFinite(laterIncome)) {
            changeLines.push(`Income change between ${earlierYearText} and ${laterYearText} is unavailable because ${laterYearText} income is missing.`);
        } else {
            changeLines.push(`Income change between ${earlierYearText} and ${laterYearText} is unavailable.`);
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
                if (Math.abs(changePercent) < 0.05) {
                    changeLines.push(`Rent prices for ${label} did not change between ${earlierYearText} and ${laterYearText}.`);
                } else {
                    const verb = changePercent > 0 ? 'increased' : 'decreased';
                    changeLines.push(`Rent prices for ${label} ${verb} by ${formatPercent(Math.abs(changePercent))} from ${earlierYearText} to ${laterYearText}.`);
                }
            } else if (Number.isFinite(earlierValue) && Number.isFinite(laterValue) && earlierValue === 0) {
                if (earlierValue === laterValue) {
                    changeLines.push(`Rent prices for ${label} did not change between ${earlierYearText} and ${laterYearText}.`);
                } else {
                    const verb = laterValue > earlierValue ? 'increased' : 'decreased';
                    changeLines.push(`Rent prices for ${label} ${verb} from ${formatMoney(earlierValue)} to ${formatMoney(laterValue)} between ${earlierYearText} and ${laterYearText}.`);
                }
            } else if (!Number.isFinite(earlierValue) && Number.isFinite(laterValue)) {
                changeLines.push(`Rent change data for ${label} between ${earlierYearText} and ${laterYearText} is unavailable because ${earlierYearText} rent is missing.`);
            } else if (Number.isFinite(earlierValue) && !Number.isFinite(laterValue)) {
                changeLines.push(`Rent change data for ${label} between ${earlierYearText} and ${laterYearText} is unavailable because ${laterYearText} rent is missing.`);
            } else {
                changeLines.push(`Rent change data for ${label} between ${earlierYearText} and ${laterYearText} is unavailable.`);
            }
        });

        appendCard(row, `${familyLabel} in ${city} (${yearText})`, primaryLines, 'rent-info-card-primary');
        appendCard(row, `${familyLabel} in ${city} (${comparisonYearText})`, comparisonDetailLines, 'rent-info-card-secondary');
        appendCard(row, `Change from ${earlierYearText} to ${laterYearText}`, changeLines, 'rent-info-card-change');
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

        container.append('span').text('Compare affordability in');
        const citySelection = createSelection(cities, 'Select cities', container, {
            initialSelected: cities,
            onChange: selected => this.handleCityChange(selected)
        });

        container.append('span').text('for');
        const householdDropdown = createDropdown(households, 'Select household type', container, {
            initialSelected: households[0] || null,
            onChange: selected => this.handleHouseholdChange(selected)
        });

        container.append('span').text('earning the typical local income.');

        this.controls = { citySelection, householdDropdown };
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
