(function () {
  "use strict";

  const PROVINCE_NAMES = {
    "Alta": "Alberta",
    "B.C.": "British Columbia",
    "Man.": "Manitoba",
    "N.B.": "New Brunswick",
    "N.S.": "Nova Scotia",
    "N.W.T.": "Northwest Territories",
    "Nfld.Lab.": "Newfoundland and Labrador",
    "Ont.": "Ontario",
    "P.E.I.": "Prince Edward Island",
    "Que": "Quebec",
    "Sask.": "Saskatchewan",
  };

  const DEFAULT_FILTERS = {
    rent: "all",
    sort: "vacancy-high",
  };

  // Match the city set used in incomeRentV2 (largest city per province)
  const ALLOWED_CITIES = [
    "Calgary",
    "Charlottetown",
    "Halifax",
    "Moncton",
    "Montréal",
    "Saskatoon",
    "St. John's",
    "Toronto",
    "Vancouver",
    "Winnipeg",
  ];
  const ALLOWED_CITY_SET = new Set(ALLOWED_CITIES);

  // Visual tuning values for the SVG layout
  const CONFIG = {
    windowCols: 5,
    windowRows: 20,
    windowSize: 16,
    windowGap: 5,
    buildingPadding: 10,
    vacancyUnitPerWindow: 1250,
    cardPaddingX: 18,
    cardGapX: 32,
    cardGapY: 42,
    labelHeight: 64,
    margin: { top: 20, right: 20, bottom: 20, left: 20 },
  };

  const COLORS = {
    buildingFill: "#2d3748",
    buildingStroke: "#1a202c",
    windowBorder: "#1a202c",
    windowOccupied: "#ed8936",
    windowOccupiedAlt: "#f6ad55",
    windowVacant: "#5f5244ff",
    windowPartialStroke: "#ed8936",
    labelBg: "#ffffff",
    labelText: "#1a365d",
    labelSubText: "#4a5568",
    highVacancyBg: "rgba(72,187,120,0.12)",
    highVacancyStroke: "rgba(72,187,120,0.6)",
  };

  function normalizeCityName(name) {
    return (name || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
  }

  function formatNumber(num) {
    if (!Number.isFinite(num)) return "N/A";
    return Math.round(num).toLocaleString();
  }

  function getFullProvinceName(abbreviation) {
    return PROVINCE_NAMES[abbreviation] || abbreviation;
  }

  function formatPopulation(pop) {
    if (pop >= 1000000) return (pop / 1000000).toFixed(1) + "M";
    if (pop >= 1000) return Math.round(pop / 1000) + "K";
    return pop.toString();
  }

  class VacancyVisD3 {
    constructor(containerId = "buildings-container") {
      this.containerId = containerId;
      this.containerEl = document.getElementById(containerId);
      this.viewportEl =
        document.querySelector(".buildings-viewport") || this.containerEl;

      this.housingSupply = new Map();
      this.allCitiesData = [];
      this.selectedCities = [];
      this.currentFilters = { ...DEFAULT_FILTERS };
      this.tooltip = null;

      this.svg = null;
      this.buildingWidth =
        CONFIG.windowCols * CONFIG.windowSize +
        (CONFIG.windowCols - 1) * CONFIG.windowGap +
        2 * CONFIG.buildingPadding;
      this.cardWidth = this.buildingWidth + CONFIG.cardPaddingX * 2;

      this.currentYear = 2023;
      this.supplyYearExtent = [2023, 2023];
      this.vacancyYearExtent = [null, null];
      this.populationYearExtent = [null, null];
      this.populationData = new Map();
      this.vacancyRates = new Map();
      this.unitPerWindow = CONFIG.vacancyUnitPerWindow;
      this.currentScaleKey = "";

      this.resizeTimeout = null;
      this.handleResize = this.handleResize.bind(this);
      this.tooltip = null;
      this.infoElements = {
        city: null,
        population: null,
        vacancyRate: null,
        year: null,
        citySelect: null,
        yearSlider: null,
        yearDisplay: null,
      };
    }

    init(data) {
      if (!this.containerEl) {
        console.error(
          `[VacancyVisD3] Container #${this.containerId} not found in DOM`
        );
        return this;
      }

      this.allCitiesData = (data || []).filter((d) =>
        ALLOWED_CITY_SET.has(d.city)
      );
      this.selectedCities = this.allCitiesData
        .slice()
        .sort((a, b) => b.population - a.population)
        .slice(0, 4)
        .map((d) => d.city);
      this.setupCitySelector();
      this.setupFilterListeners();
      this.cacheInfoElements();
      this.setupControlPanel();

      Promise.all([
        this.loadHousingSupply().catch((err) => {
          console.error("[VacancyVisD3] Failed to load housing supply", err);
        }),
        this.loadPopulationData().catch((err) => {
          console.error("[VacancyVisD3] Failed to load population data", err);
        }),
        this.loadVacancyRates().catch((err) => {
          console.error("[VacancyVisD3] Failed to load vacancy rates", err);
        }),
      ])
        .finally(() => {
          this.syncCurrentYearFromData();
          this.recomputeGlobalMax().then(() => {
            this.setupControlPanel();
            this.render();
          });
        });

      window.addEventListener("resize", this.handleResize);
      return this;
    }

    handleResize() {
      if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
      this.resizeTimeout = setTimeout(() => {
        this.render();
      }, 160);
    }

    loadHousingSupply() {
      return d3
        .json("data/vacancy/canada_housing_supply.json")
        .then((raw) => {
          const lookup = new Map();
          Object.entries(raw || {}).forEach(([city, entries]) => {
            if (!Array.isArray(entries) || !entries.length) return;
            const cleaned = entries
              .filter((e) => e && Number.isFinite(e.homes) && e.year)
              .sort((a, b) => a.year - b.year);
            if (!cleaned.length) return;
            lookup.set(normalizeCityName(city), cleaned);
          });
          this.housingSupply = lookup;
          const allYears = Array.from(lookup.values())
            .flat()
            .map((e) => e.year);
          const extent = d3.extent(allYears);
          this.supplyYearExtent = extent;
          this.currentYear =
            extent && Number.isFinite(extent[1]) ? extent[1] : this.currentYear;
        });
    }

    loadPopulationData() {
      // Population by city/year comes from the rent+population CSV.
      return d3.csv("data/avg_rent_by_pop.csv").then((rows) => {
        const lookup = new Map();

        rows.forEach((row) => {
          if (!row || !row.GEO) return;
          const cityName = row.GEO.split(",")[0].trim();
          const year = parseInt(row.REF_DATE, 10);
          const pop = parseFloat(row.POP);
          if (!cityName || !Number.isFinite(year) || !Number.isFinite(pop)) return;

          const key = normalizeCityName(cityName);
          if (!lookup.has(key)) lookup.set(key, []);
          const entries = lookup.get(key);
          if (!entries.find((e) => e.year === year)) {
            entries.push({ year, pop });
          }
        });

        lookup.forEach((arr) => arr.sort((a, b) => a.year - b.year));

        const allYears = Array.from(lookup.values())
          .flat()
          .map((e) => e.year);
        this.populationYearExtent = d3.extent(allYears);
        this.populationData = lookup;
      });
    }

    loadVacancyRates() {
      return d3.json("data/vacancy/vacancy_rates.json").then((raw) => {
        const lookup = new Map();

        Object.entries(raw || {}).forEach(([cityKey, entries]) => {
          if (!Array.isArray(entries) || !entries.length) return;
          const cityName = cityKey.split(",")[0].trim();
          const cleaned = entries
            .map((e) => ({
              year: Number.isFinite(e.year) ? e.year : parseInt(e.year, 10),
              vacancy_rate: Number.isFinite(e.vacancy_rate)
                ? e.vacancy_rate
                : parseFloat(e.vacancy_rate),
            }))
            .filter(
              (e) =>
                e &&
                Number.isFinite(e.year) &&
                Number.isFinite(e.vacancy_rate)
            )
            .sort((a, b) => a.year - b.year);
          if (!cleaned.length) return;
          lookup.set(normalizeCityName(cityName), cleaned);
        });

        const allYears = Array.from(lookup.values())
          .flat()
          .map((e) => e.year);
        this.vacancyRates = lookup;
        this.vacancyYearExtent = allYears.length
          ? d3.extent(allYears)
          : [null, null];
      });
    }

    getYearExtent() {
      const extents = [
        this.supplyYearExtent,
        this.vacancyYearExtent,
        this.populationYearExtent,
      ].filter(
        (ext) =>
          Array.isArray(ext) &&
          ext.length === 2 &&
          Number.isFinite(ext[0]) &&
          Number.isFinite(ext[1])
      );
      if (!extents.length) return null;
      const minYear = d3.min(extents, (e) => e[0]);
      const maxYear = d3.max(extents, (e) => e[1]);
      return [minYear, maxYear];
    }

    syncCurrentYearFromData() {
      const extent = this.getYearExtent();
      if (!extent) return;
      const [, maxYear] = extent;
      if (Number.isFinite(maxYear)) {
        this.currentYear = maxYear;
      }
    }

    computeCityVacantUnits(city, yearOverride) {
      const targetYear = Number.isFinite(yearOverride)
        ? yearOverride
        : this.currentYear;
      const baseCityData = city._agg || this.getAveragedUnitData(city);
      const vacancyEntry = this.getVacancyRate(
        city.city,
        targetYear,
        baseCityData,
        city.year
      );
      const vacancyRate =
        vacancyEntry && Number.isFinite(vacancyEntry.vacancy_rate)
          ? vacancyEntry.vacancy_rate
          : baseCityData && Number.isFinite(baseCityData.vacancy_rate)
            ? baseCityData.vacancy_rate
            : null;
      const cityData = baseCityData
        ? { ...baseCityData, vacancy_rate: vacancyRate }
        : { vacancy_rate: vacancyRate };
      const supplyEntry = this.getHousingSupply(city.city, targetYear);
      const populationEntry = this.getPopulation(city.city, targetYear);
      const housingSupply = supplyEntry ? supplyEntry.homes : null;
      const vacantUnits =
        Number.isFinite(housingSupply) && Number.isFinite(cityData.vacancy_rate)
          ? housingSupply * (cityData.vacancy_rate / 100)
          : null;
      return {
        cityData,
        vacancyRate,
        vacancyYear: vacancyEntry ? vacancyEntry.year : city.year || null,
        supplyEntry,
        housingSupply,
        vacantUnits,
        population: populationEntry ? populationEntry.pop : null,
        populationYear: populationEntry ? populationEntry.year : null,
      };
    }

    recomputeGlobalMax() {
      return new Promise((resolve) => {
        const maxVacantUnits =
          d3.max(
            this.allCitiesData,
            (city) => this.computeCityVacantUnits(city, this.currentYear).vacantUnits || null
          ) || 0;
        this.allMaxVacantUnits = maxVacantUnits;
        resolve(maxVacantUnits);
      });
    }

    setupFilterListeners() {
      const rentFilter = document.getElementById("rent-filter");
      const sortFilter = document.getElementById("sort-filter");
      const resetButton = document.getElementById("reset-filters");

      if (!sortFilter || !resetButton) {
        return;
      }

      if (rentFilter) {
        rentFilter.addEventListener("change", (e) => {
          this.currentFilters.rent = e.target.value;
          this.render();
        });
      }

      sortFilter.addEventListener("change", (e) => {
        this.currentFilters.sort = e.target.value;
        this.render();
      });

      resetButton.addEventListener("click", () => {
        if (rentFilter) rentFilter.value = DEFAULT_FILTERS.rent;
        sortFilter.value = DEFAULT_FILTERS.sort;
        this.currentFilters = { ...DEFAULT_FILTERS };
        this.selectedCities = [];
        this.updateSelectedCitiesDisplay();
        this.render();
      });
    }

    getAveragedUnitData(city) {
      const data = city && city.data ? city.data : null;
      if (!data || typeof data !== "object") return null;

      const entries = Object.entries(data).filter(
        ([, v]) =>
          v &&
          typeof v === "object" &&
          Number.isFinite(v.vacancy_rate)
      );

      const nonTotal = entries.filter(([k]) => k !== "total");
      const useEntries = nonTotal.length ? nonTotal : entries;
      if (!useEntries.length) return null;

      const sums = useEntries.reduce(
        (acc, [, v]) => {
          acc.vacancy += v.vacancy_rate;
          if (Number.isFinite(v.avg_rent)) {
            acc.rent += v.avg_rent;
            acc.rentCount += 1;
          }
          return acc;
        },
        { rent: 0, rentCount: 0, vacancy: 0 }
      );
      const count = useEntries.length;
      return {
        avg_rent: sums.rentCount ? sums.rent / sums.rentCount : null,
        vacancy_rate: sums.vacancy / count,
        unitCount: count,
      };
    }

    setupCitySelector() {
      const searchInput = document.getElementById("city-search");
      const cityDropdown = document.getElementById("city-dropdown");
      const provinceSelect = document.getElementById("province-select");
      const tabCities = document.getElementById("tab-cities");
      const tabProvinces = document.getElementById("tab-provinces");

      if (
        !searchInput ||
        !cityDropdown ||
        !provinceSelect ||
        !tabCities ||
        !tabProvinces
      ) {
        return;
      }

      this.populateProvinceDropdown();

      tabCities.addEventListener("click", () => {
        tabCities.classList.add("active");
        tabProvinces.classList.remove("active");
        searchInput.style.display = "block";
        provinceSelect.style.display = "none";
        cityDropdown.style.display = "none";
      });

      tabProvinces.addEventListener("click", () => {
        tabProvinces.classList.add("active");
        tabCities.classList.remove("active");
        searchInput.style.display = "none";
        provinceSelect.style.display = "block";
        cityDropdown.style.display = "none";
      });

      provinceSelect.addEventListener("change", (e) => {
        const province = e.target.value;
        if (province) {
          this.selectProvinceCities(province);
          e.target.value = "";
        }
      });

      searchInput.addEventListener("focus", () => {
        this.updateCityDropdown("");
        cityDropdown.style.display = "block";
      });

      searchInput.addEventListener("input", (e) => {
        const searchTerm = e.target.value;
        this.updateCityDropdown(searchTerm);
      });

      document.addEventListener("click", (e) => {
        if (!e.target.closest(".city-selector-container")) {
          cityDropdown.style.display = "none";
        }
      });
    }

    cacheInfoElements() {
      this.infoElements.cityList = document.getElementById("vacancy-city-list");
      this.infoElements.cityListSel = d3.select("#vacancy-city-list");
      this.infoElements.yearSlider = document.getElementById(
        "vacancy-year-slider"
      );
      this.infoElements.yearDisplay = document.getElementById(
        "vacancy-year-display"
      );
      this.infoElements.yearMin = document.getElementById("vacancy-year-min");
      this.infoElements.yearMax = document.getElementById("vacancy-year-max");
      this.infoElements.scaleValue = document.getElementById(
        "vacancy-scale-value"
      );
      this.infoElements.scaleNote = document.getElementById(
        "vacancy-scale-note"
      );
      this.infoElements.cityButtons = document.getElementById(
        "vacancy-city-buttons"
      );
    }

    setupControlPanel() {
      const { yearSlider, yearDisplay } = this.infoElements;
      if (this.infoElements.cityButtons) {
        const container = this.infoElements.cityButtons;
        container.innerHTML = "";
        const sorted = this.allCitiesData
          .slice()
          .sort((a, b) => a.city.localeCompare(b.city));
        sorted.forEach((d) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "vacancy-city-btn";
          btn.textContent = d.city;
          if (this.selectedCities.includes(d.city)) btn.classList.add("active");
          btn.addEventListener("click", () => {
            this.toggleCityQueue(d.city);
            Array.from(container.children).forEach((child) => {
              child.classList.toggle(
                "active",
                this.selectedCities.includes(child.textContent)
              );
            });
            this.render();
          });
          container.appendChild(btn);
        });
      }

      if (yearSlider && yearDisplay) {
        const extent = this.getYearExtent() || [2000, this.currentYear || 2023];
        const minYear = Number.isFinite(extent[0]) ? extent[0] : 2000;
        const maxYear = Number.isFinite(extent[1])
          ? extent[1]
          : Math.max(minYear, this.currentYear || 2023);
        const clampedYear = Math.max(
          minYear,
          Math.min(maxYear, this.currentYear || maxYear)
        );
        yearSlider.min = minYear;
        yearSlider.max = maxYear;
        yearSlider.value = clampedYear;
        this.currentYear = clampedYear;
        yearDisplay.textContent = clampedYear;
        if (this.infoElements.yearMin)
          this.infoElements.yearMin.textContent = yearSlider.min;
        if (this.infoElements.yearMax)
          this.infoElements.yearMax.textContent = yearSlider.max;
        yearSlider.oninput = (e) => {
          const yr = parseInt(e.target.value, 10);
          this.currentYear = yr;
          yearDisplay.textContent = yr;
          this.recomputeGlobalMax().then(() => this.render());
        };
      }

      this.updateScaleDisplay(null);
    }

    populateProvinceDropdown() {
      const provinceSelect = document.getElementById("province-select");
      if (!provinceSelect) return;

      // Clear existing (except placeholder)
      while (provinceSelect.options.length > 1) {
        provinceSelect.remove(1);
      }

      const provincesMap = new Map();
      this.allCitiesData.forEach((d) => {
        if (!provincesMap.has(d.province)) {
          const citiesInProvince = this.allCitiesData.filter(
            (c) => c.province === d.province
          );
          provincesMap.set(d.province, citiesInProvince.length);
        }
      });

      const provinces = Array.from(provincesMap.entries()).sort((a, b) =>
        a[0].localeCompare(b[0])
      );

      provinces.forEach(([province, count]) => {
        const option = document.createElement("option");
        option.value = province;
        option.textContent = `${getFullProvinceName(province)} (${count} cities)`;
        provinceSelect.appendChild(option);
      });
    }

    selectProvinceCities(province) {
      const citiesInProvince = this.allCitiesData
        .filter((d) => d.province === province)
        .map((d) => d.city);

      citiesInProvince.forEach((city) => {
        if (!this.selectedCities.includes(city)) {
          this.selectedCities.push(city);
        }
      });

      this.updateSelectedCitiesDisplay();
      this.render();
    }

    updateCityDropdown(searchTerm) {
      const cityList = document.getElementById("city-list");
      const dropdown = document.getElementById("city-dropdown");
      const searchInput = document.getElementById("city-search");
      if (!cityList || !dropdown || !searchInput) return;

      const cityMap = new Map();
      this.allCitiesData.forEach((d) => {
        if (!cityMap.has(d.city)) cityMap.set(d.city, d.province);
      });

      let availableCities = Array.from(cityMap, ([name, province]) => ({
        name,
        province,
      }));

      if (searchTerm) {
        availableCities = availableCities.filter(
          (city) =>
            city.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            city.province.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }

      cityList.innerHTML = "";

      const header = document.createElement("div");
      header.className = "dropdown-header";
      header.textContent = searchTerm
        ? `${availableCities.length} cities found`
        : `All ${cityMap.size} cities`;
      cityList.appendChild(header);

      if (availableCities.length === 0) {
        cityList.innerHTML +=
          '<div style="padding: 20px; text-align: center; color: #718096;">No cities match your search</div>';
        return;
      }

      const citiesByProvince = new Map();
      availableCities.forEach((city) => {
        if (!citiesByProvince.has(city.province)) {
          citiesByProvince.set(city.province, []);
        }
        citiesByProvince.get(city.province).push(city);
      });

      const sortedProvinces = Array.from(citiesByProvince.keys()).sort();

      sortedProvinces.forEach((province) => {
        const provinceHeader = document.createElement("div");
        provinceHeader.className = "province-group-header";
        provinceHeader.textContent = `${getFullProvinceName(province)} (${
          citiesByProvince.get(province).length
        })`;
        cityList.appendChild(provinceHeader);

        const cities = citiesByProvince
          .get(province)
          .sort((a, b) => a.name.localeCompare(b.name));

        cities.forEach((city) => {
          const isSelected = this.selectedCities.includes(city.name);
          const option = document.createElement("div");
          option.className = "city-option";
          if (isSelected) option.classList.add("selected");

          const cityName = document.createElement("span");
          cityName.textContent = city.name;
          option.appendChild(cityName);

          option.addEventListener("click", () => {
            this.toggleCitySelection(city.name);
            searchInput.value = "";
            this.updateCityDropdown("");
          });

          cityList.appendChild(option);
        });
      });
    }

    toggleCitySelection(cityName) {
      const index = this.selectedCities.indexOf(cityName);
      if (index > -1) {
        this.selectedCities.splice(index, 1);
      } else {
        this.selectedCities.push(cityName);
      }
      this.updateSelectedCitiesDisplay();
      this.render();
    }

    updateSelectedCitiesDisplay() {
      const container = document.getElementById("selected-cities");
      if (!container) return;

      container.innerHTML = "";

      if (this.selectedCities.length === 0) {
        container.innerHTML =
          '<div style="color: #718096; font-size: 0.9em; padding: 5px;">No cities selected - showing all</div>';
        return;
      }

      this.selectedCities.forEach((cityName) => {
        const tag = document.createElement("div");
        tag.className = "selected-city-tag";
        tag.innerHTML = `
          <span>${cityName}</span>
          <span class="remove-city" data-city="${cityName}">×</span>
        `;
        tag
          .querySelector(".remove-city")
          .addEventListener("click", (e) => {
            e.stopPropagation();
            this.toggleCitySelection(cityName);
          });
        container.appendChild(tag);
      });
    }

    getHousingSupply(cityName, year) {
      const key = normalizeCityName(cityName);
      const entries = this.housingSupply.get(key) || null;
      if (!entries || !entries.length) return null;
      if (!year) return entries[entries.length - 1];
      let closest = entries[0];
      entries.forEach((e) => {
        const diff = Math.abs(e.year - year);
        const closestDiff = Math.abs(closest.year - year);
        if (diff < closestDiff || (diff === closestDiff && e.year > closest.year)) {
          closest = e;
        }
      });
      return closest;
    }

    getPopulation(cityName, year) {
      const key = normalizeCityName(cityName);
      const entries = this.populationData && this.populationData.get(key);
      if (!entries || !entries.length) return null;
      if (!Number.isFinite(year)) return entries[entries.length - 1];
      let closest = entries[0];
      entries.forEach((e) => {
        const diff = Math.abs(e.year - year);
        const closestDiff = Math.abs(closest.year - year);
        if (diff < closestDiff || (diff === closestDiff && e.year > closest.year)) {
          closest = e;
        }
      });
      return closest;
    }

    getVacancyRate(cityName, year, fallbackData, fallbackYear) {
      const key = normalizeCityName(cityName);
      const entries = this.vacancyRates && this.vacancyRates.get(key);
      if (entries && entries.length) {
        if (!Number.isFinite(year)) return entries[entries.length - 1];
        let closest = entries[0];
        entries.forEach((e) => {
          const diff = Math.abs(e.year - year);
          const closestDiff = Math.abs(closest.year - year);
          if (diff < closestDiff || (diff === closestDiff && e.year > closest.year)) {
            closest = e;
          }
        });
        return closest;
      }
      if (fallbackData && Number.isFinite(fallbackData.vacancy_rate)) {
        return {
          year: Number.isFinite(fallbackYear) ? fallbackYear : null,
          vacancy_rate: fallbackData.vacancy_rate,
        };
      }
      return null;
    }

    toggleCityQueue(cityName) {
      const existingIdx = this.selectedCities.indexOf(cityName);
      if (existingIdx >= 0) {
        this.selectedCities.splice(existingIdx, 1);
      } else {
        this.selectedCities.push(cityName);
        if (this.selectedCities.length > 4) {
          this.selectedCities.shift();
        }
      }
    }

    ensureTooltip() {
      if (this.tooltip && !this.tooltip.empty()) return this.tooltip;
      const tip = d3
        .select("body")
        .append("div")
        .attr("class", "vacancy-tooltip")
        .style("position", "fixed")
        .style("pointer-events", "none")
        .style("padding", "10px 12px")
        .style("background", "rgba(26, 32, 44, 0.9)")
        .style("color", "#edf2f7")
        .style("border-radius", "6px")
        .style("font-size", "12px")
        .style("line-height", "1.4")
        .style("box-shadow", "0 6px 16px rgba(0,0,0,0.25)")
        .style("opacity", 0)
        .style("transition", "opacity 120ms ease");
      this.tooltip = tip;
      return this.tooltip;
    }

    showTooltip(content, event) {
      const tip = this.ensureTooltip();
      tip.html(content).style("opacity", 1);
      const offset = 14;
      const { clientX, clientY } = event;
      tip
        .style("left", `${clientX + offset}px`)
        .style("top", `${clientY + offset}px`);
    }

    hideTooltip() {
      if (this.tooltip) {
        this.tooltip.style("opacity", 0);
      }
    }

    buildTooltipHtml(data) {
      if (!Number.isFinite(data.vacantUnits)) {
        return `<div><strong>${data.city}</strong></div><div>Vacant homes unavailable</div>`;
      }
      const est = data.housingSupplyEstimate ? " (estimate)" : " (reported)";
      return `<div><strong>${data.city}</strong></div><div>≈ ${formatNumber(
        data.vacantUnits
      )} vacant homes${est}</div><div style="color:#cbd5e0;font-size:11px;"> Each dark window ≈ ${formatNumber(
        data.vacancyUnitPerWindow
      )} homes</div>`;
    }

    updateScaleDisplay(unitPerWindow) {
      if (!this.infoElements.scaleValue) return;
      const display = unitPerWindow
        ? `Each dark window ≈ ${formatNumber(unitPerWindow)} homes`
        : "–";
      this.infoElements.scaleValue.textContent = display;
      if (this.infoElements.scaleNote) {
        this.infoElements.scaleNote.textContent =
          "Scale updates when the city selection changes";
      }
    }

    updateInfoPanelList(cities) {
      const listSel = this.infoElements.cityListSel;
      if (!listSel || listSel.empty()) return;

      listSel.selectAll("*").remove();
      const data = cities || [];
      const rowHeight = 90;
      const padding = 16;
      const containerNode = this.infoElements.cityList;
      const containerWidth =
        (containerNode && containerNode.clientWidth) || 0;
      const svgWidth = Math.max(520, containerWidth || 0);

      if (!data.length) {
        const svg = listSel
          .append("svg")
          .attr("width", svgWidth)
          .attr("height", rowHeight)
          .style("max-width", "100%");
        svg
          .append("text")
          .attr("x", svgWidth / 2)
          .attr("y", rowHeight / 2)
          .attr("text-anchor", "middle")
          .attr("dominant-baseline", "middle")
          .attr("fill", "#718096")
          .text("No cities selected");
        return;
      }

      const height = padding * 2 + rowHeight * data.length;
      const colName = 6;
      const colPop = 12;
      const colVac = 90;
      const colVacUnits = 170;
      const colSup = 290;
      const svg = listSel
        .append("svg")
        .attr("class", "vacancy-city-svg")
        .attr("width", svgWidth)
        .attr("height", height)
        .style("max-width", "100%");

      const rows = svg
        .selectAll("g.city-row")
        .data(data, (d) => d.key)
        .enter()
        .append("g")
        .attr("class", "city-row")
        .attr("transform", (_d, i) => {
          const y = padding + i * rowHeight;
          return `translate(0, ${y})`;
        });

      rows
        .append("text")
        .attr("x", colName)
        .attr("y", 16)
        .attr("fill", "#1a365d")
        .attr("font-size", "16px")
        .attr("font-weight", "700")
        .text((d) => d.city);

      rows
        .append("text")
        .attr("x", colPop)
        .attr("y", 36)
        .attr("fill", "#4a5568")
        .attr("font-size", "12px")
        .text("Population");

      rows
        .append("text")
        .attr("x", colVac)
        .attr("y", 36)
        .attr("fill", "#4a5568")
        .attr("font-size", "12px")
        .text("Vacancy");

      rows
        .append("text")
        .attr("x", colVacUnits)
        .attr("y", 36)
        .attr("fill", "#4a5568")
        .attr("font-size", "12px")
        .text("Vacant units (est.)");

      rows
        .append("text")
        .attr("x", colSup)
        .attr("y", 36)
        .attr("fill", "#4a5568")
        .attr("font-size", "12px")
        .text("Housing supply");

      rows
        .append("text")
        .attr("x", colPop)
        .attr("y", 56)
        .attr("fill", "#2d3748")
        .attr("font-size", "14px")
        .attr("font-weight", "600")
        .text((d) =>
          Number.isFinite(d.population) ? formatPopulation(d.population) : "–"
        );

      rows
        .append("text")
        .attr("x", colVac)
        .attr("y", 56)
        .attr("fill", "#2d3748")
        .attr("font-size", "14px")
        .attr("font-weight", "600")
        .text((d) =>
          Number.isFinite(d.vacancyRate) ? `${d.vacancyRate.toFixed(1)}%` : "–"
        );

      rows
        .append("text")
        .attr("x", colVacUnits)
        .attr("y", 56)
        .attr("fill", "#2d3748")
        .attr("font-size", "14px")
        .attr("font-weight", "600")
        .text((d) =>
          Number.isFinite(d.vacantUnits) ? formatNumber(d.vacantUnits) : "–"
        );

      rows
        .append("text")
        .attr("x", colSup)
        .attr("y", 56)
        .attr("fill", "#2d3748")
        .attr("font-size", "14px")
        .attr("font-weight", "600")
        .text((d) =>
          Number.isFinite(d.housingSupply) ? formatNumber(d.housingSupply) : "–"
        );

      rows
        .filter((d) => d.housingSupplyEstimate)
        .append("text")
        .attr("x", colSup)
        .attr("y", 72)
        .attr("fill", "#718096")
        .attr("font-size", "10px")
        .text("(estimated)");
    }

    applyFilters() {
      let filteredData = this.allCitiesData
        .map((city) => {
          const agg = this.getAveragedUnitData(city);
          const vacancyEntry = this.getVacancyRate(
            city.city,
            this.currentYear,
            agg,
            city.year
          );
          const vacancyRate =
            vacancyEntry && Number.isFinite(vacancyEntry.vacancy_rate)
              ? vacancyEntry.vacancy_rate
              : agg && Number.isFinite(agg.vacancy_rate)
                ? agg.vacancy_rate
                : null;
          return {
            ...city,
            _agg: agg,
            _vacancyRate: vacancyRate,
          };
        })
        .filter(
          (d) =>
            d._agg &&
            Number.isFinite(d._vacancyRate)
        );

      if (this.selectedCities.length > 0) {
        filteredData = filteredData.filter((d) =>
          this.selectedCities.includes(d.city)
        );
      } else {
        filteredData = [];
      }

      switch (this.currentFilters.sort) {
        case "vacancy-low":
          filteredData.sort(
            (a, b) => a._vacancyRate - b._vacancyRate
          );
          break;
        case "name":
          filteredData.sort((a, b) => a.city.localeCompare(b.city));
          break;
        default:
          filteredData.sort(
            (a, b) => b._vacancyRate - a._vacancyRate
          );
          break;
      }

      return filteredData;
    }

    render() {
      const filtered = this.applyFilters();
      this.draw(filtered);
    }

    buildWindows(vacantWindows, totalWindows, rows) {
      if (!totalWindows) return [];

      const windows = [];
      for (let i = 0; i < totalWindows; i += 1) {
        const rowFromBottom = Math.floor(i / CONFIG.windowCols);
        const row = rows - 1 - rowFromBottom;
        const col = i % CONFIG.windowCols;
        windows.push({
          type: i < vacantWindows ? "vacant" : "occupied",
          row,
          col,
        });
      }
      return windows;
    }

    ensureSvg() {
      if (this.svg && !this.svg.empty()) return this.svg;
      this.containerEl.innerHTML = "";
      this.svg = d3
        .select(this.containerEl)
        .append("svg")
        .attr("class", "vacancy-d3-svg");
      return this.svg;
    }

    ensureGradients(defs) {
      if (defs.select("#vacancy-building-gradient").empty()) {
        const grad = defs
          .append("linearGradient")
          .attr("id", "vacancy-building-gradient")
          .attr("x1", "0%")
          .attr("y1", "0%")
          .attr("x2", "0%")
          .attr("y2", "100%");
        grad
          .append("stop")
          .attr("offset", "0%")
          .attr("stop-color", "#556080");
        grad
          .append("stop")
          .attr("offset", "100%")
          .attr("stop-color", "#2d3748");
      }
    }


    draw(cities) {
      if (!this.containerEl) return;

      if (!cities || cities.length === 0) {
        this.currentScaleKey = "";
        this.unitPerWindow = CONFIG.vacancyUnitPerWindow;
        if (this.svg) {
          this.svg.remove();
          this.svg = null;
        }
        this.containerEl.innerHTML =
          '<div class="vacancy-empty">No cities selected. Choose up to four cities to view buildings.</div>';
        this.updateInfoPanelList([]);
        return;
      }

      const baseVisuals = cities.map((city) => {
        const {
          cityData,
          supplyEntry,
          housingSupply,
          vacantUnits,
          population,
          populationYear,
          vacancyRate,
          vacancyYear,
        } = this.computeCityVacantUnits(city);
        return {
          key: `${city.city}-${city.province}-${city.year}-avg`,
          city: city.city,
          province: city.province,
          year: city.year,
          population,
          populationYear,
          vacancyRate,
          vacancyYear,
          avgRent: cityData.avg_rent,
          housingSupply,
          housingSupplyYear: supplyEntry ? supplyEntry.year : null,
          housingSupplyEstimate: supplyEntry ? supplyEntry.estimate : false,
          vacantUnits,
        };
      });

      const uniformTotalWindows =
        (CONFIG.windowCols || 4) * (CONFIG.windowRows || 25);
      const uniformRows = CONFIG.windowRows || Math.max(
        1,
        Math.ceil(uniformTotalWindows / CONFIG.windowCols)
      );
      const uniformBuildingHeight =
        uniformRows * CONFIG.windowSize +
        Math.max(0, uniformRows - 1) * CONFIG.windowGap +
        2 * CONFIG.buildingPadding;

      const selectionKey = cities
        .map((c) => c.city)
        .slice()
        .sort()
        .join("|");
      let unitPerWindow = this.unitPerWindow || CONFIG.vacancyUnitPerWindow;
      if (selectionKey !== this.currentScaleKey) {
        const maxVacantUnits =
          d3.max(
            baseVisuals,
            (d) => (Number.isFinite(d.vacantUnits) ? d.vacantUnits : null)
          ) || 0;
        unitPerWindow =
          maxVacantUnits > 0
            ? Math.max(1, maxVacantUnits / uniformTotalWindows)
            : CONFIG.vacancyUnitPerWindow;
        this.unitPerWindow = unitPerWindow;
        this.currentScaleKey = selectionKey;
      }

      const visuals = baseVisuals.map((d) => {
        const vacantWindowsRaw =
          d.vacantUnits === null
            ? 0
            : Math.max(
                d.vacantUnits > 0 ? 1 : 0,
                Math.round(d.vacantUnits / unitPerWindow)
              );
        const vacantWindows = Math.max(
          0,
          Math.min(vacantWindowsRaw, uniformTotalWindows)
        );
        const windows = this.buildWindows(
          vacantWindows,
          uniformTotalWindows,
          uniformRows
        );
        return {
          ...d,
          vacantWindows,
          vacancyUnitPerWindow: unitPerWindow,
          windowCount: uniformTotalWindows,
          windows,
          rows: uniformRows,
          buildingHeight: uniformBuildingHeight,
        };
      });

      this.updateScaleDisplay(unitPerWindow);
      this.updateInfoPanelList(visuals);

      const maxBuildingHeight = uniformBuildingHeight;

      const containerWidth =
        (this.viewportEl && this.viewportEl.clientWidth) ||
        this.containerEl.clientWidth ||
        900;
      const columns = Math.max(
        1,
        Math.floor(
          (containerWidth -
            CONFIG.margin.left -
            CONFIG.margin.right +
            CONFIG.cardGapX) /
            (this.cardWidth + CONFIG.cardGapX)
        )
      );
      const rowsNeeded = Math.ceil(visuals.length / columns);

      const cardHeight =
        maxBuildingHeight +
        CONFIG.labelHeight +
        12;

      const svgWidth =
        CONFIG.margin.left +
        CONFIG.margin.right +
        columns * this.cardWidth +
        Math.max(0, columns - 1) * CONFIG.cardGapX;
      const svgHeight =
        CONFIG.margin.top +
        CONFIG.margin.bottom +
        rowsNeeded * cardHeight +
        Math.max(0, rowsNeeded - 1) * CONFIG.cardGapY;

      const svg = this.ensureSvg();
      svg.attr("width", svgWidth).attr("height", svgHeight);

      const defs =
        !svg.select("defs").empty() ? svg.select("defs") : svg.append("defs");
      this.ensureGradients(defs);

      const cards = svg
        .selectAll("g.city-card")
        .data(visuals, (d) => d.key);

      const cardsEnter = cards
        .enter()
        .append("g")
        .attr("class", "city-card");

      cardsEnter.append("g").attr("class", "building-group");
      cardsEnter.append("g").attr("class", "label-group");

      cards.exit().remove();

      const merged = cardsEnter.merge(cards);

      merged.attr("transform", (d, i) => {
        const col = i % columns;
        const row = Math.floor(i / columns);
        const x =
          CONFIG.margin.left + col * (this.cardWidth + CONFIG.cardGapX);
        const y = CONFIG.margin.top + row * (cardHeight + CONFIG.cardGapY);
        return `translate(${x}, ${y})`;
      });

      merged.each((d, i, nodes) => {
        this.drawCard(
          d3.select(nodes[i]),
          {
            maxBuildingHeight,
            cardHeight,
          }
        );
      });
    }

    drawCard(card, layout) {
      const data = card.datum();
      const buildingX = (this.cardWidth - this.buildingWidth) / 2;
      const buildingY =
        layout.maxBuildingHeight - data.buildingHeight;
      const labelY = layout.maxBuildingHeight + 12;

      card
        .on("mouseenter", (event) =>
          this.showTooltip(this.buildTooltipHtml(data), event)
        )
        .on("mousemove", (event) =>
          this.showTooltip(this.buildTooltipHtml(data), event)
        )
        .on("mouseleave", () => this.hideTooltip());

      // Building + windows
      const buildingGroup = card.select("g.building-group");
      buildingGroup.selectAll("*").remove();
      buildingGroup.attr("transform", `translate(${buildingX}, ${buildingY})`);

      buildingGroup
        .append("rect")
        .attr("width", this.buildingWidth)
        .attr("height", data.buildingHeight)
        .attr("fill", "url(#vacancy-building-gradient)")
        .attr("stroke", COLORS.buildingStroke)
        .attr("stroke-width", 2)
        .attr("rx", 6)
        .attr("ry", 6);

      const windowGroup = buildingGroup
        .append("g")
        .attr(
          "transform",
          `translate(${CONFIG.buildingPadding}, ${CONFIG.buildingPadding})`
        );

      const windows = windowGroup
        .selectAll("g.window")
        .data(data.windows, (w, i) => `${w.type}-${i}`);

      const windowsEnter = windows
        .enter()
        .append("g")
        .attr("class", "window");

      const windowSize = CONFIG.windowSize;
      const windowGap = CONFIG.windowGap;

      windowsEnter
        .append("rect")
        .attr("width", windowSize)
        .attr("height", windowSize)
        .attr("rx", 3)
        .attr("ry", 3)
        .attr("stroke", COLORS.windowBorder)
        .attr("stroke-width", 1.2)
        .attr("fill", (w) =>
          w.type === "vacant" ? COLORS.windowVacant : COLORS.windowOccupied
        )
        .style("pointer-events", "none");

      const windowsMerged = windowsEnter.merge(windows);

      windowsMerged.attr(
        "transform",
        (w) =>
          `translate(${w.col * (windowSize + windowGap)}, ${
            w.row * (windowSize + windowGap)
          })`
      );

      windowsMerged
        .select("rect")
        .transition()
        .duration(400)
        .ease(d3.easeCubicOut)
        .attr("fill", (w) =>
          w.type === "vacant" ? COLORS.windowVacant : COLORS.windowOccupied
        );
      windows.exit().remove();

      // Label block
      const labelGroup = card.select("g.label-group");
      labelGroup.selectAll("*").remove();
      labelGroup.attr("transform", `translate(0, ${labelY})`);

      const nameY = 18;
      labelGroup
        .append("text")
        .attr("x", this.cardWidth / 2)
        .attr("y", nameY)
        .attr("text-anchor", "middle")
        .attr("font-weight", "700")
        .attr("font-size", "14px")
        .attr("fill", COLORS.labelText)
        .text(`${data.city}`);

      labelGroup
        .append("text")
        .attr("x", this.cardWidth / 2)
        .attr("y", nameY + 16)
        .attr("text-anchor", "middle")
        .attr("font-size", "12px")
        .attr("fill", COLORS.labelSubText)
        .text(`${getFullProvinceName(data.province)}`);
    }
  }

  window.initVacancyVisD3 = function initVacancyVisD3(data) {
    const vis = new VacancyVisD3();
    vis.init(data);
    return vis;
  };

  window.VacancyVisD3 = VacancyVisD3;
})();
