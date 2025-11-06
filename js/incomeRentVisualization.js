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
            .domain([0, 15000])
            .range([0, vis.height]);

        const yAxis = d3.axisLeft(vis.yScale)
            .ticks(6)
            .tickFormat(d3.format(','));

        vis.yAxisGroup = vis.svg.append('g')
            .attr('class', 'axis axis-y')
            .call(yAxis);

        

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

    update() {
        if (!this.svg || !this.yScale) {
            return;
        }

        const aptFilterActive = this.selectedApartmentTypes.size > 0;
        const cityFilterActive = this.selectedCities.size > 0;
        const noCitySelection = this.selectedCities.size === 0;
        const yearFilterActive = Number.isFinite(this.selectedYear);

        const filteredRent = noCitySelection ? [] : this.rentData.filter(d => {
            const includeType = !aptFilterActive || this.selectedApartmentTypes.has(d.type);
            const includeCity = !cityFilterActive || this.selectedCities.has(d.cityLabel);
            const includeYear = !yearFilterActive || Number(d.date) === this.selectedYear;
            return includeType && includeCity && includeYear;
        });

        const filteredIncome = noCitySelection ? [] : this.incomeData.filter(d => {
            const includeCity = !cityFilterActive || this.selectedCities.has(d.cityLabel);
            const includeHousehold = !this.selectedHousehold || d.familyType === this.selectedHousehold;
            const includeYear = !yearFilterActive || Number(d.date) === this.selectedYear;
            return includeCity && includeHousehold && includeYear;
        });

        const cityCount = cityFilterActive
            ? this.selectedCities.size
            : new Set(filteredRent.map(d => d.cityLabel)).size;

        const typeCount = filteredRent.length > 0
            ? new Set(filteredRent.map(d => d.type)).size
            : 0;

        const householdLabel = this.selectedHousehold ? ` for ${this.selectedHousehold}` : '';

        const yearLabel = yearFilterActive ? `for ${this.selectedYear}` : 'across all years';

        const rentTypeOrder = ['0br', '1br', '2br', '3br'];
        const cityMetrics = {};

        const cityKeys = Array.from(this.selectedCities);

        cityKeys.forEach(city => {
            const rentRecords = filteredRent.filter(d => d.cityLabel === city);
            const rentValues = rentTypeOrder.map(type => {
                const values = rentRecords
                    .filter(r => r.type === type)
                    .map(r => Number(r.value))
                    .filter(value => Number.isFinite(value));
                return values.length ? d3.mean(values) : null;
            });

            const incomeRecord = filteredIncome.find(d => d.cityLabel === city);
            const incomeValue = incomeRecord && Number.isFinite(Number(incomeRecord.value))
                ? Number(incomeRecord.value)
                : null;

            cityMetrics[city] = {
                income: incomeValue / 12,
                rent: rentValues
            };
        });

        this.cityMetrics = cityMetrics;

        this.filteredRent = filteredRent;
        this.filteredIncome = filteredIncome;
        this.latestSummary = {
            rentRecords: filteredRent.length,
            incomeRecords: filteredIncome.length,
            cityCount,
            typeCount,
            household: this.selectedHousehold || null,
            year: yearFilterActive ? this.selectedYear : null,
            summaryText: `Showing ${filteredRent.length} rent records and ${filteredIncome.length} income records ${yearLabel} across ${cityCount} cities and ${typeCount} unit types${householdLabel}.`
        };

        const vis = this;
        const blockWidth = 180;
        const blockHeight = 80;
        const gap = 20;
        const startX = 10;
        const startY = 0;

        const cityEntries = Object.entries(this.cityMetrics);
        const cityGroups = vis.svg.selectAll('.city-card')
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
            .attr('fill', '#dde1e7')
            .attr('stroke', '#000000')
            .attr('stroke-width', 1);
        
        
        



        
        cityGroupsEnter.append('rect')
            .attr('class', 'threebr-block')
            .attr('width', blockWidth)
            .attr('height', blockHeight)
            .attr('fill', '#A37272')
            .attr('stroke', '#000000')
            .attr('stroke-width', 1);
        cityGroupsEnter.append('rect')
            .attr('class', 'twobr-block')
            .attr('width', blockWidth)
            .attr('height', blockHeight)
            .attr('fill', '#A272A3')
            .attr('stroke', '#000000')
            .attr('stroke-width', 1);
        cityGroupsEnter.append('rect')
            .attr('class', 'onebr-block')
            .attr('width', blockWidth)
            .attr('height', blockHeight)
            .attr('fill', '#7296A3')
            .attr('stroke', '#000000')
            .attr('stroke-width', 1);
        cityGroupsEnter.append('rect')
            .attr('class', 'bachelor-block')
            .attr('width', blockWidth)
            .attr('height', blockHeight)
            .attr('fill', '#77A372')
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

        const cityGroupsMerged = cityGroupsEnter.merge(cityGroups);


        cityGroupsEnter.append('text')
            .attr('class', 'city-card-status')
            .attr('x', blockWidth / 2)
            .attr('y', blockHeight / 2)
            .attr('text-anchor', 'middle')
            .attr('fill', '#6b7280')
            .attr('font-size', 12)
            .attr('font-style', 'italic');
        cityGroupsMerged
            .attr('transform', (d, i) => `translate(${startX + i * (blockWidth + gap)}, ${startY})`)
            .style('cursor', 'pointer')
            .on('mouseenter', function () {
                d3.select(this).classed('is-hovered', true);
            })
            .on('mouseleave', function () {
                d3.select(this).classed('is-hovered', false);
            })
            .on('click', (_, [city, metrics]) => {
                console.log(`City: ${city}`, metrics);
            });

        cityGroupsMerged.select('.city-card-label')
            .text(d => d[0]);
        cityGroupsMerged.select('.city-card-bg')
            .attr('height', ([, metrics]) => metrics.income ? vis.yScale(metrics.income) : 0)
            .style('display', ([, metrics]) => metrics.income ? null : 'none');
        cityGroupsMerged.select('.bachelor-block')
            .attr('height', ([, metrics]) => {
                const rentValue = metrics.rent[0];
                return rentValue !== null ? vis.yScale(rentValue) : 0;
            })
            .style('display', ([, metrics]) => metrics.income ? null : 'none');
        cityGroupsMerged.select('.onebr-block')
            .attr('height', ([, metrics]) => {
                const rentValue = metrics.rent[1];
                return rentValue !== null ? vis.yScale(rentValue) : 0;
            })
            .style('display', ([, metrics]) => metrics.income ? null : 'none');
        cityGroupsMerged.select('.twobr-block')
            .attr('height', ([, metrics]) => {
                const rentValue = metrics.rent[2];
                return rentValue !== null ? vis.yScale(rentValue) : 0;
            })
            .style('display', ([, metrics]) => metrics.income ? null : 'none');
        cityGroupsMerged.select('.threebr-block')
            .attr('height', ([, metrics]) => {
                const rentValue = metrics.rent[3];
                return rentValue !== null ? vis.yScale(rentValue) : 0;
            })
            .style('display', ([, metrics]) => metrics.income ? null : 'none');

        cityGroupsMerged.select('.city-card-status')
            .text(([, metrics]) => metrics.income ? '' : 'No data')
            .style('display', ([, metrics]) => metrics.income ? 'none' : null);

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