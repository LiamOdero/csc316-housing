const INCOME_DATA_MAP = {
    city: "GEO",
    date: "REF_DATE",
    value: "VALUE",
    source: "Income source",
    familyType: "Economic family type"
};

const RENT_DATA_MAP = {
    city: "GEO",
    date: "REF_DATE",
    value: "VALUE",
    type: "Type of unit"
};

const TARGET_YEAR = 2023;
const RENT_TYPE_ORDER = ["3br", "2br", "1br", "0br"];

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

Promise.all([
    d3.csv("data/rent-prices-data.csv").then(rows => rows.map(row => mapRowBySchema(row, RENT_DATA_MAP))),
    d3.csv("data/income-data.csv").then(rows => rows.map(row => mapRowBySchema(row, INCOME_DATA_MAP)))
]).then(([rentData, incomeData]) => {
    const vis = new IncomeRentComparison({
        container: "#vis4",
        rentData,
        incomeData,
        year: TARGET_YEAR
    });

    vis.init();
});

class IncomeRentComparison {
    constructor({container, rentData, incomeData, year}) {
        this.container = d3.select(container);
        this.rawRentData = rentData;
        this.rawIncomeData = incomeData;
        this.year = year;
        this.state = {
            selectedFamilyType: null,
            selectedSources: new Set(),
            selectedCities: new Set()
        };

        this.availableSources = [];
        this.availableCities = [];
    }

    init() {
        this.prepareRentData();
        this.prepareIncomeData();
        this.buildLayout();
        this.populateFamilyOptions();
        this.renderInitialState();
    }

    prepareRentData() {
        const relevantRows = this.rawRentData
            .filter(row => row.value > 0 && row.date === this.year)
            .map(row => ({...row, type: normalizeRentType(row.type)}))
            .filter(row => RENT_TYPE_ORDER.includes(row.type));

        this.rentByCity = d3.rollup(
            relevantRows,
            rows => {
                const groupedByType = d3.group(rows, row => row.type);
                const averages = {};

                RENT_TYPE_ORDER.forEach(type => {
                    const typeRows = groupedByType.get(type);

                    if (typeRows && typeRows.length) {
                        averages[type] = d3.mean(typeRows, row => row.value);
                    }
                });

                return averages;
            },
            row => row.city
        );
    }

    prepareIncomeData() {
        const relevantRows = this.rawIncomeData.filter(row => row.value > 0 && row.date === this.year);

        this.incomeByFamily = d3.rollup(
            relevantRows,
            familyRows => d3.rollup(
                familyRows,
                sourceRows => d3.rollup(
                    sourceRows,
                    cityRows => d3.mean(cityRows, row => row.value / 12),
                    row => row.city
                ),
                row => row.source
            ),
            row => row.familyType
        );

        this.familyTypes = Array.from(this.incomeByFamily.keys()).sort(d3.ascending);
    }

    buildLayout() {
        this.container.selectAll("*").remove();

        this.wrapper = this.container
            .append("div")
            .attr("class", "col-12 col-lg-10")
            .style("margin-top", "240px");

        const card = this.wrapper
            .append("div")
            .attr("class", "card shadow-sm");

        const cardBody = card
            .append("div")
            .attr("class", "card-body");

        this.controlsEl = cardBody
            .append("div")
            .attr("class", "income-rent__controls mb-3 d-flex flex-column flex-xl-row flex-wrap gap-3 align-items-xl-center");

        const familyFilter = this.controlsEl
            .append("div")
            .attr("class", "d-flex flex-column flex-sm-row gap-2 align-items-sm-center");

        familyFilter
            .append("label")
            .attr("for", "income-family-select")
            .attr("class", "form-label fw-semibold mb-0")
            .text("Household type");

        this.familySelect = familyFilter
            .append("select")
            .attr("id", "income-family-select")
            .attr("class", "form-select form-select-sm")
            .on("change", event => {
                this.onFamilyChange(event.target.value);
            });

        const sourceFilter = this.controlsEl
            .append("div")
            .attr("class", "d-flex flex-column gap-1");

        sourceFilter
            .append("span")
            .attr("class", "form-label fw-semibold mb-0")
            .text("Income sources");

        const sourceDropdown = sourceFilter
            .append("div")
            .attr("class", "dropdown");

        this.sourceButton = sourceDropdown
            .append("button")
            .attr("class", "btn btn-outline-secondary btn-sm dropdown-toggle")
            .attr("type", "button")
            .attr("id", "income-source-dropdown")
            .attr("data-bs-toggle", "dropdown")
            .attr("aria-expanded", "false")
            .text("All income sources");

        this.sourceMenu = sourceDropdown
            .append("div")
            .attr("class", "dropdown-menu p-3 dropdown-menu-end small")
            .style("min-width", "240px");

        const cityFilter = this.controlsEl
            .append("div")
            .attr("class", "d-flex flex-column gap-1");

        cityFilter
            .append("span")
            .attr("class", "form-label fw-semibold mb-0")
            .text("Cities");

        const cityDropdown = cityFilter
            .append("div")
            .attr("class", "dropdown");

        this.cityButton = cityDropdown
            .append("button")
            .attr("class", "btn btn-outline-secondary btn-sm dropdown-toggle")
            .attr("type", "button")
            .attr("id", "income-city-dropdown")
            .attr("data-bs-toggle", "dropdown")
            .attr("aria-expanded", "false")
            .text("All cities");

        this.cityMenu = cityDropdown
            .append("div")
            .attr("class", "dropdown-menu p-3 dropdown-menu-end small overflow-auto")
            .style("min-height", "120px")
            .style("max-height", "260px")
            .style("min-width", "240px");

        this.table = cardBody
            .append("table")
            .attr("class", "table table-striped table-bordered table-sm mb-0");

        this.chartArea = cardBody
            .append("div")
            .attr("class", "income-rent__chart mt-4");
    }

    populateFamilyOptions() {
        if (!this.familySelect) {
            return;
        }

        this.familySelect
            .selectAll("option")
            .data(this.familyTypes, d => d)
            .join(
                enter => enter
                    .append("option")
                    .attr("value", d => d)
                    .text(d => d),
                update => update.text(d => d),
                exit => exit.remove()
            );

        this.familySelect.property("disabled", this.familyTypes.length === 0);
    }

    populateSourceOptions(sources = []) {
        if (!this.sourceMenu) {
            return;
        }

        this.availableSources = [...sources];

        const labels = this.sourceMenu
            .selectAll("label.dropdown-item")
            .data(sources, d => d)
            .join(
                enter => {
                    const label = enter
                        .append("label")
                        .attr("class", "dropdown-item d-flex align-items-center gap-2");

                    label.append("input")
                        .attr("type", "checkbox")
                        .attr("class", "form-check-input flex-shrink-0")
                        .attr("value", d => d)
                        .on("click", event => event.stopPropagation())
                        .on("change", (event, value) => {
                            event.stopPropagation();
                            this.onSourceToggle(value, event.target.checked);
                        });

                    label.append("span")
                        .attr("class", "flex-grow-1")
                        .text(d => d);

                    return label;
                },
                update => update,
                exit => exit.remove()
            );

        labels.select("input")
            .property("checked", d => this.state.selectedSources.has(d));

        this.updateSourceButtonLabel();
    }

    populateCityOptions(cities = []) {
        if (!this.cityMenu) {
            return;
        }

        this.availableCities = [...cities];

        const labels = this.cityMenu
            .selectAll("label.dropdown-item")
            .data(cities, d => d)
            .join(
                enter => {
                    const label = enter
                        .append("label")
                        .attr("class", "dropdown-item d-flex align-items-center gap-2");

                    label.append("input")
                        .attr("type", "checkbox")
                        .attr("class", "form-check-input flex-shrink-0")
                        .attr("value", d => d)
                        .on("click", event => event.stopPropagation())
                        .on("change", (event, value) => {
                            event.stopPropagation();
                            this.onCityToggle(value, event.target.checked);
                        });

                    label.append("span")
                        .attr("class", "flex-grow-1")
                        .text(d => d);

                    return label;
                },
                update => update,
                exit => exit.remove()
            );

        labels.select("input")
            .property("checked", d => this.state.selectedCities.has(d));

        this.updateCityButtonLabel();
    }

    updateSourceButtonLabel() {
        if (!this.sourceButton) {
            return;
        }

        const total = this.availableSources.length;
        const selectedCount = this.state.selectedSources.size;

        let label = "Select income sources";

        if (total === 0) {
            label = "No income sources";
            this.sourceButton.attr("disabled", true);
        } else {
            this.sourceButton.attr("disabled", null);
            if (selectedCount === 0) {
                label = "Select income sources";
            } else if (selectedCount === total) {
                label = "All income sources";
            } else if (selectedCount === 1) {
                label = Array.from(this.state.selectedSources)[0];
            } else {
                label = `${selectedCount} sources`;
            }
        }

        this.sourceButton.text(label);
    }

    updateCityButtonLabel() {
        if (!this.cityButton) {
            return;
        }

        const total = this.availableCities.length;
        const selectedCount = this.state.selectedCities.size;

        let label = "Select cities";

        if (total === 0) {
            label = "No cities";
            this.cityButton.attr("disabled", true);
        } else {
            this.cityButton.attr("disabled", null);
            if (selectedCount === 0) {
                label = "Select cities";
            } else if (selectedCount === total) {
                label = "All cities";
            } else if (selectedCount === 1) {
                label = Array.from(this.state.selectedCities)[0];
            } else {
                label = `${selectedCount} cities`;
            }
        }

        this.cityButton.text(label);
    }

    refreshCityOptions({forceReset = false} = {}) {
        if (!this.state.selectedFamilyType) {
            this.availableCities = [];
            this.state.selectedCities = new Set();
            this.populateCityOptions([]);
            return;
        }

        const sources = Array.from(this.state.selectedSources);
        const cities = this.getCitiesForSelection(this.state.selectedFamilyType, sources);

        let nextSelection;
        if (forceReset || this.state.selectedCities.size === 0) {
            nextSelection = new Set(cities);
        } else {
            const retained = Array.from(this.state.selectedCities).filter(city => cities.includes(city));
            nextSelection = retained.length ? new Set(retained) : new Set(cities);
        }

        this.state.selectedCities = nextSelection;
        this.populateCityOptions(cities);
    }

    getCitiesForSelection(familyType, sources) {
        const familyData = this.incomeByFamily.get(familyType);
        if (!familyData) {
            return [];
        }

        const citySet = new Set();
        sources.forEach(source => {
            const cityMap = familyData.get(source);
            if (!cityMap) {
                return;
            }
            cityMap.forEach((value, city) => {
                if (this.rentByCity.has(city)) {
                    citySet.add(city);
                }
            });
        });

        return Array.from(citySet).sort(d3.ascending);
    }

    onSourceToggle(source, checked) {
        const nextSelection = new Set(this.state.selectedSources);

        if (checked) {
            nextSelection.add(source);
        } else {
            nextSelection.delete(source);
        }

        this.state.selectedSources = nextSelection;

        if (this.sourceMenu) {
            this.sourceMenu.selectAll("input")
                .property("checked", d => this.state.selectedSources.has(d));
        }

        this.updateSourceButtonLabel();
        this.refreshCityOptions({forceReset: false});
        this.renderComparison();
    }

    onCityToggle(city, checked) {
        const nextSelection = new Set(this.state.selectedCities);

        if (checked) {
            nextSelection.add(city);
        } else {
            nextSelection.delete(city);
        }

        this.state.selectedCities = nextSelection;

        if (this.cityMenu) {
            this.cityMenu.selectAll("input")
                .property("checked", d => this.state.selectedCities.has(d));
        }

        this.updateCityButtonLabel();
        this.renderComparison();
    }

    renderInitialState() {
        if (!this.familyTypes.length) {
            this.renderEmptyState("No income data available for the selected year.");
            if (this.familySelect) {
                this.familySelect.property("disabled", true);
            }
            this.updateSourceButtonLabel();
            this.updateCityButtonLabel();
            return;
        }

        if (this.familySelect) {
            this.familySelect.property("disabled", false);
        }

        this.onFamilyChange(this.familyTypes[0], {forceReset: true});
    }

    onFamilyChange(familyType, {forceReset = false} = {}) {
        this.state.selectedFamilyType = familyType;

        if (this.familySelect) {
            this.familySelect.property("value", familyType);
        }

        const sources = this.getSourcesForFamily(familyType);

        let nextSelection;
        if (forceReset || this.state.selectedSources.size === 0) {
            nextSelection = new Set(sources);
        } else {
            const retained = Array.from(this.state.selectedSources).filter(source => sources.includes(source));
            nextSelection = retained.length ? new Set(retained) : new Set(sources);
        }

        this.state.selectedSources = nextSelection;
        this.populateSourceOptions(sources);
        this.refreshCityOptions({forceReset: true});
        this.renderComparison();
    }

    getSourcesForFamily(familyType) {
        const familyData = this.incomeByFamily.get(familyType);
        if (!familyData) {
            return [];
        }

        return Array.from(familyData.keys()).sort(d3.ascending);
    }

    renderComparison() {
        const {selectedFamilyType, selectedSources, selectedCities} = this.state;

        if (!selectedFamilyType) {
            this.renderEmptyState("Select a household type to see matching data.");
            return;
        }

        const familyData = this.incomeByFamily.get(selectedFamilyType);
        if (!familyData || familyData.size === 0) {
            this.renderEmptyState("No income data found for this household type.");
            return;
        }

        if (!selectedSources || selectedSources.size === 0) {
            this.renderEmptyState("Select at least one income source.");
            return;
        }

        if (!selectedCities || selectedCities.size === 0) {
            this.renderEmptyState("Select at least one city.");
            return;
        }

        const cityIncomeMap = new Map();

        selectedSources.forEach(source => {
            const sourceData = familyData.get(source);
            if (!sourceData) {
                return;
            }

            sourceData.forEach((monthlyIncome, city) => {
                if (!this.rentByCity.has(city)) {
                    return;
                }

                if (!cityIncomeMap.has(city)) {
                    cityIncomeMap.set(city, []);
                }

                cityIncomeMap.get(city).push(monthlyIncome);
            });
        });

        const comparisonData = [];

        selectedCities.forEach(city => {
            const incomes = cityIncomeMap.get(city);
            const rentInfo = this.rentByCity.get(city);

            if (!incomes || incomes.length === 0 || !rentInfo) {
                return;
            }

            comparisonData.push({
                city,
                monthlyIncome: d3.mean(incomes),
                rents: rentInfo
            });
        });

        if (comparisonData.length === 0) {
            this.renderEmptyState("No overlapping rent data for the current selection.");
            return;
        }

        comparisonData.sort((a, b) => d3.ascending(a.city, b.city));
        //this.renderTable(comparisonData);
        this.renderVisualization(comparisonData);
    }

    renderTable(data) {
        const columns = [
            {key: "city", label: "City"},
            {key: "monthlyIncome", label: "Monthly Income"},
            ...RENT_TYPE_ORDER.map(type => ({key: type, label: `${type.toUpperCase()} Rent`}))
        ];

        const thead = this.table.selectAll("thead").data([null]).join("thead");

        const headerRow = thead
            .selectAll("tr")
            .data([columns])
            .join("tr");

        headerRow
            .selectAll("th")
            .data(columns)
            .join("th")
            .text(column => column.label);

        const tbody = this.table.selectAll("tbody").data([null]).join("tbody");

        const rows = tbody
            .selectAll("tr")
            .data(data, d => d.city)
            .join("tr");

        rows.selectAll("td")
            .data(rowData => columns.map(column => this.resolveCellValue(column.key, rowData)))
            .join("td")
            .text(cell => cell);
    }

    resolveCellValue(columnKey, rowData) {
        if (columnKey === "city") {
            return rowData.city;
        }

        if (columnKey === "monthlyIncome") {
            return this.formatCurrency(rowData.monthlyIncome);
        }

        const rentValue = rowData.rents[columnKey];
        return Number.isFinite(rentValue) ? this.formatCurrency(rentValue) : "N/A";
    }

    renderEmptyState(message) {
        this.table.selectAll("*").remove();

        this.table.append("tbody")
            .append("tr")
            .append("td")
            .attr("colspan", RENT_TYPE_ORDER.length + 2)
            .attr("class", "text-center text-muted")
            .text(message);

        if (this.chartArea) {
            this.chartArea.selectAll("*").remove();
        }
    }

    formatCurrency(value) {
        if (!Number.isFinite(value)) {
            return "N/A";
        }

        return `$${d3.format(",.2f")(value)}`;
    }

    renderVisualization(data) {
        if (!this.chartArea) {
            return;
        }

        const colors = d3.scaleOrdinal()
            .domain(RENT_TYPE_ORDER)
            .range([ "#cb181d",  "#731ed4ff", "#24d5e2ff","#1cd825ff"]);
        const svg = this.chartArea
            .selectAll("svg")
            .data([null])
            .join("svg")
            .attr("class", "income-rent__svg w-100")
            .attr("width", 960)
            .attr("height", 500);

        svg.selectAll("*").remove();

        const maxValue = d3.max(data, d => d3.max([
            d.monthlyIncome,
            ...RENT_TYPE_ORDER.map(type => d.rents[type] || 0)
        ])) || 0;

        if (maxValue === 0) {
            return;
        }

        const sizeScale = d3.scaleLinear()
            .domain([0, maxValue])
            .range([0, 300]);

        let xOffset = 60;
        const baseY = 40;

        data.forEach(city => {
            const incomeSize = sizeScale(city.monthlyIncome);
            const group = svg.append("g")
                .attr("class", "city-node")
                .attr("transform", `translate(${xOffset}, ${baseY})`);

            group.append("rect")
                .attr("class", "income-square")
                .attr("width", incomeSize)
                .attr("height", incomeSize)
                .attr("fill", "white")
                .attr("stroke", "#000000ff")
                .attr("stroke-width", 2)
                .attr("y", baseY);

            group.append("text")
                .attr("class", "city-label")
                .attr("x", incomeSize / 2)
                .attr("y", -15)
                .attr("text-anchor", "middle")
                .text(city.city);

            group.append("text")
                .attr("class", "income-label")
                .attr("x", incomeSize / 2)
                .attr("y", incomeSize + 22 + baseY)
                .attr("text-anchor", "middle")
                .text(`Income: ${this.formatCurrency(city.monthlyIncome)}`);

            const rentEntries = RENT_TYPE_ORDER
                .map(type => ({type, value: city.rents[type]}))
                .filter(entry => Number.isFinite(entry.value));

            rentEntries.forEach(entry => {
                const rentSize = sizeScale(entry.value);
                const offset = (incomeSize - rentSize) / 2;

                group.append("rect")
                    .attr("class", `rent-square rent-square--${entry.type}`)
                    .attr("y", baseY)
                    .attr("width", incomeSize)
                    .attr("height", rentSize)
                    .attr("fill", colors(entry.type))
                    .attr("stroke", "#000000ff")
                    .attr("stroke-width", 1);
            });

            rentEntries.slice().reverse().forEach((entry, idx) => {
                group.append("text")
                    .attr("class", "rent-label")
                    .attr("x", incomeSize / 2)
                    .attr("y", incomeSize + 42 + idx * 16 + baseY)
                    .attr("text-anchor", "middle")
                    .attr("fill", colors(entry.type))
                    .text(`${entry.type.toUpperCase()}: ${this.formatCurrency(entry.value)}`);
            });

            xOffset += incomeSize + 180;
        });
    }
}
