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
        ? options.initialSelected
        : options.initialSelected !== undefined
            ? [options.initialSelected]
            : data;
    const selected = new Set(initialSelection);
    const onSelectionChange = typeof options.onChange === 'function' ? options.onChange : () => { };

    const updateButtonLabel = () => {
        if (selected.size === 0) {
            button.text(defaultText || 'Select options');
            return;
        }
        if (selected.size === 1) {
            button.text(Array.from(selected).join(', '));
            return;
        }
        const values = Array.from(selected);
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
        this.selectedCities = new Set(this.incomeData.map(d => d.cityLabel));
        this.selectedHousehold = null;
        this.cityMetrics = {};
        this.focusedCity = null;
        this.focusMarker = null;
        this.focusChartGroup = null;
        this.focusChartLeft = null;
        this.focusChartRight = null;
            this.cardGroup = null;
        this.lineGenerator = null;
        this.seriesColors = {
            income: '#9e9e9eff',
            '0br': '#77A372',
            '1br': '#7296A3',
            '2br': '#A272A3',
            '3br': '#A37272'
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

        const xDomain =[2000, 2023];

        vis.xScale = d3.scaleLinear()
            .domain(xDomain)
            .range([0, vis.width]);

        vis.xAxis = d3.axisTop(vis.xScale)
            .ticks(Math.min(8, xDomain[1] - xDomain[0]))
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
            .attr('stroke-width', 1.5)
            .attr('stroke-dasharray', '4 3')
            .style('opacity', 0)
            .style('pointer-events', 'none');

        vis.focusChartGroup = vis.svg.append('g')
            .attr('class', 'focus-chart')
            .style('opacity', 0)
            .style('pointer-events', 'none');

        vis.focusChartLeft = vis.focusChartGroup.append('g')
            .attr('class', 'focus-chart-left');

        vis.focusChartRight = vis.focusChartGroup.append('g')
            .attr('class', 'focus-chart-right');

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
            const city = d.cityLabel;
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
            const city = d.cityLabel;
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

        const cityCount = cityKeys.length;
        const typeCount = filteredRent.length > 0
            ? new Set(filteredRent.map(d => d.type)).size
            : 0;

        const householdLabel = this.selectedHousehold ? ` for ${this.selectedHousehold}` : '';
        const yearLabel = yearFilterActive ? `for ${this.selectedYear}` : 'across all years';

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
        this.latestSummary = {
            rentRecords: rentRecordCount,
            incomeRecords: incomeRecordCount,
            cityCount,
            typeCount,
            household: this.selectedHousehold || null,
            year: yearFilterActive ? this.selectedYear : null,
            summaryText: `Showing ${rentRecordCount} rent records and ${incomeRecordCount} income records ${yearLabel} across ${cityCount} cities and ${typeCount} unit types${householdLabel}.`
        };

    const vis = this;
    const baseBlockWidth = 180;
        const blockHeight = 80;
        const gap = 20;
        const startX = 10;
        const startY = 0;

        const cityEntries = Object.entries(this.cityMetrics);
        if (cityEntries.length === 0 && this.focusedCity) {
            this.focusedCity = null;
        }
        const hasFocusedCity = Boolean(this.focusedCity);
        const focusYear = hasFocusedCity
            ? (Number.isFinite(this.selectedYear) ? this.selectedYear : vis.xScale.domain()[0])
            : null;
        const focusSeries = hasFocusedCity ? this.buildFocusSeries(this.focusedCity) : [];
        const blockWidth = hasFocusedCity ? baseBlockWidth / 2 : baseBlockWidth;
        const rawFocusX = hasFocusedCity && Number.isFinite(focusYear) ? vis.xScale(focusYear) : null;
        const focusLeftX = rawFocusX !== null
            ? Math.max(0, Math.min(rawFocusX, vis.width - blockWidth))
            : null;
        const focusRightX = focusLeftX !== null ? focusLeftX + blockWidth : null;

        vis.xAxisGroup
            .style('opacity', hasFocusedCity ? 1 : 0);

        if (vis.focusChartGroup) {
            const focusLeftData = [];
            const focusRightData = [];

            if (hasFocusedCity && focusSeries.length > 0 && focusLeftX !== null && focusRightX !== null) {
                focusSeries.forEach(series => {
                    const color = this.seriesColors[series.key] || '#111827';
                    const values = Array.isArray(series.values) ? series.values : [];

                    const leftValues = values
                        .filter(point => Number.isFinite(point.value) && point.year <= focusYear)
                        .map(point => ({ ...point }));

                    if (leftValues.length) {
                        const lastIndex = leftValues.length - 1;
                        const lastPoint = leftValues[lastIndex];
                        if (lastPoint.year === focusYear) {
                            leftValues[lastIndex] = { ...lastPoint, xOverride: focusLeftX };
                        } else {
                            const focusPoint = values.find(point => Number.isFinite(point.value) && point.year === focusYear);
                            if (focusPoint) {
                                leftValues.push({ ...focusPoint, xOverride: focusLeftX });
                            }
                        }
                        if (leftValues.length >= 2) {
                            focusLeftData.push({ key: series.key, color, values: leftValues });
                        }
                    }

                    const rightValues = values
                        .filter(point => Number.isFinite(point.value) && point.year >= focusYear)
                        .map(point => ({ ...point }));

                    if (rightValues.length) {
                        if (rightValues[0].year === focusYear) {
                            rightValues[0] = { ...rightValues[0], xOverride: focusRightX };
                        } else {
                            const focusPoint = values.find(point => Number.isFinite(point.value) && point.year === focusYear);
                            if (focusPoint) {
                                rightValues.unshift({ ...focusPoint, xOverride: focusRightX });
                            }
                        }
                        if (rightValues.length >= 2) {
                            focusRightData.push({ key: series.key, color, values: rightValues });
                        }
                    }
                });
            }

            const active = hasFocusedCity && (focusLeftData.length > 0 || focusRightData.length > 0);
            vis.focusChartGroup
                .style('opacity', active ? 1 : 0)
                .style('pointer-events', 'none');

            const leftSelection = vis.focusChartLeft
                ? vis.focusChartLeft.selectAll('.focus-series-left').data(focusLeftData, d => d.key)
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
                    .attr('d', d => this.areaGenerator ? this.areaGenerator(d.values) : null);

                leftMerged.select('.focus-line-left')
                    .attr('fill', 'none')
                    .attr('stroke-width', 2.5)
                    .attr('opacity', 1)
                    .attr('stroke', d => d.color)
                    .attr('d', d => this.lineGenerator ? this.lineGenerator(d.values) : null);

                if (vis.focusChartLeft) {
                    vis.focusChartLeft.selectAll('.focus-series-left').order();
                }
            }

            const rightSelection = vis.focusChartRight
                ? vis.focusChartRight.selectAll('.focus-series-right').data(focusRightData, d => d.key)
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
                    .attr('d', d => this.areaGenerator ? this.areaGenerator(d.values) : null);

                rightMerged.select('.focus-line-right')
                    .attr('fill', 'none')
                    .attr('stroke-width', 2.5)
                    .attr('opacity', 1)
                    .attr('stroke', d => d.color)
                    .attr('d', d => this.lineGenerator ? this.lineGenerator(d.values) : null);

                if (vis.focusChartRight) {
                    vis.focusChartRight.selectAll('.focus-series-right').order();
                }
            }

            if (active && typeof vis.focusChartGroup.raise === 'function') {
                vis.focusChartGroup.raise();
            }
        }

        const cityGroupSelection = vis.cardGroup || vis.svg;
        const cityGroups = cityGroupSelection.selectAll('.city-card')
            .data(cityEntries, d => d[0]);

        cityGroups.exit().remove();

        vis.svg.selectAll('.vis-no-selection').remove();

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
                if (hasFocusedCity) {
                    const [city] = d;
                    if (city !== this.focusedCity) {
                        return `translate(${startX}, ${startY})`;
                    }
                    const alignedX = focusLeftX !== null ? focusLeftX : startX;
                    return `translate(${alignedX}, ${startY})`;
                }
                return `translate(${startX + i * (blockWidth + gap)}, ${startY})`;
            })
            .style('cursor', 'pointer')
            .style('display', d => (hasFocusedCity && d[0] !== this.focusedCity) ? 'none' : null)
            .classed('is-focused', d => hasFocusedCity && d[0] === this.focusedCity)
            .on('mouseenter', function () {
                d3.select(this).classed('is-hovered', true);
            })
            .on('mouseleave', function () {
                d3.select(this).classed('is-hovered', false);
            })
            .on('click', (_, [city, metrics]) => {
                console.log(`City: ${city}`, metrics);
                vis.toggleCityFocus(city);
            });

        cityGroupsMerged.select('.city-card-label')
            .attr('x', blockWidth / 2)
            .text(d => d[0]);
        cityGroupsMerged.select('.city-card-bg')
            .attr('width', blockWidth)
            .attr('height', ([, metrics]) => metrics.income ? vis.yScale(metrics.income) : 0)
            .style('display', ([, metrics]) => metrics.income ? null : 'none');
        cityGroupsMerged.select('.bachelor-block')
            .attr('width', blockWidth)
            .attr('height', ([, metrics]) => {
                const rentValue = metrics.rent[0];
                return rentValue !== null ? vis.yScale(rentValue) : 0;
            })
            .style('display', ([, metrics]) => metrics.income ? null : 'none');
        cityGroupsMerged.select('.onebr-block')
            .attr('width', blockWidth)
            .attr('height', ([, metrics]) => {
                const rentValue = metrics.rent[1];
                return rentValue !== null ? vis.yScale(rentValue) : 0;
            })
            .style('display', ([, metrics]) => metrics.income ? null : 'none');
        cityGroupsMerged.select('.twobr-block')
            .attr('width', blockWidth)
            .attr('height', ([, metrics]) => {
                const rentValue = metrics.rent[2];
                return rentValue !== null ? vis.yScale(rentValue) : 0;
            })
            .style('display', ([, metrics]) => metrics.income ? null : 'none');
        cityGroupsMerged.select('.threebr-block')
            .attr('width', blockWidth)
            .attr('height', ([, metrics]) => {
                const rentValue = metrics.rent[3];
                return rentValue !== null ? vis.yScale(rentValue) : 0;
            })
            .style('display', ([, metrics]) => metrics.income ? null : 'none');

        cityGroupsMerged.select('.city-card-status')
            .attr('x', blockWidth / 2)
            .text(([, metrics]) => metrics.income ? '' : 'No data')
            .style('display', ([, metrics]) => metrics.income ? 'none' : null);

        cityGroupsMerged.select('.city-card-tooltips')
            .style('display', d => (hasFocusedCity && d[0] === this.focusedCity) ? null : 'none');

        if (hasFocusedCity && Number.isFinite(focusYear)) {
            const tooltipData = this.buildTooltipDisplayData(this.focusedCity, focusYear, blockWidth);
            const focusedTooltipGroup = cityGroupsMerged.filter(d => d[0] === this.focusedCity).select('.city-card-tooltips');
            const tooltipWidth = tooltipData.length ? tooltipData[0].width : 0;
            const maxValue = tooltipData.length
                ? d3.max(tooltipData.map(d => d.value))
                : null;
            const tooltipOffsetX = Math.max(0, (blockWidth - tooltipWidth) / 2);
            const baseY = Number.isFinite(maxValue) ? vis.yScale(maxValue) : blockHeight;

            focusedTooltipGroup
                .attr('transform', `translate(${tooltipOffsetX}, ${baseY + 12})`);

            const tooltipPills = focusedTooltipGroup.selectAll('.tooltip-pill')
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

            if (typeof focusedTooltipGroup.raise === 'function') {
                focusedTooltipGroup.raise();
            }
        } else {
            cityGroupsMerged.select('.city-card-tooltips')
                .attr('transform', `translate(0, ${blockHeight + 12})`)
                .selectAll('.tooltip-pill')
                .remove();
        }

        if (vis.cardGroup && typeof vis.cardGroup.raise === 'function') {
            vis.cardGroup.raise();
        }

        if (vis.focusMarker) {
            vis.focusMarker.style('opacity', 0);
        }

        if (cityEntries.length === 0) {
            vis.svg.append('text')
                .attr('class', 'vis-no-selection text-muted')
                .attr('x', vis.width / 2)
                .attr('y', vis.height / 2)
                .attr('text-anchor', 'middle')
                .attr('font-size', 18)
                .text('Select a city to view data.');
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
                textColor: '#f9fafb'
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
        items.forEach(item => {
            const valueText = item.value.toLocaleString();
            const text = `$${valueText}`;
            const height = 28;
            formatted.push({
                key: item.key,
                text,
                color: item.color,
                width: blockWidth,
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
            return;
        }
        if (this.focusedCity === cityName) {
            this.focusedCity = null;
        } else {
            this.focusedCity = cityName;
        }
        this.update();
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
        const cities = Array.from(new Set(this.incomeData.map(d => d.cityLabel))).sort();
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