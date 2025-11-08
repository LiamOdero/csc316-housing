// Set current year in footer
document.getElementById("current-year").textContent = new Date().getFullYear();

// Global variables
let allCitiesData = [];
let selectedCities = [];
let currentFilters = {
  unitType: "total",
  vacancy: "all",
  rent: "all",
  sort: "population",
};

let carouselViewport = null;
let carouselPrevButton = null;
let carouselNextButton = null;
let currentCarouselIndex = 0;
let cardsPerView = 1;
let cardWidthWithGap = 0;
let carouselSnapTimeout = null;
let isProgrammaticCarouselScroll = false;

setupCarouselControls();

// Load and create the building visualization
d3.json("data/BURAK_cities_data_multi_year.json")
  .then((data) => {
    console.log("Data loaded successfully:", data.length, "cities");
    allCitiesData = data;
    setupCitySelector();
    setupFilterListeners();
    applyFilters();
  })
  .catch((error) => {
    console.error("Error loading data:", error);
    // Fallback to original data if multi-year data is not available
    d3.json("data/BURAK_cities_data.json")
      .then((data) => {
        console.log("Fallback data loaded:", data.length, "cities");
        // Add year field to existing data
        allCitiesData = data.map((d) => ({ ...d, year: 2023 }));
        setupCitySelector();
        setupFilterListeners();
        applyFilters();
      })
      .catch((fallbackError) => {
        console.error("Error loading fallback data:", fallbackError);
        document.getElementById("buildings-container").innerHTML =
          '<p style="color: #ff6b6b; text-align: center;">Error loading visualization data.</p>';
      });
  });

function setupCarouselControls() {
  carouselViewport = document.querySelector(".buildings-viewport");
  carouselPrevButton = document.getElementById("buildings-prev");
  carouselNextButton = document.getElementById("buildings-next");

  if (!carouselViewport || !carouselPrevButton || !carouselNextButton) {
    console.warn("Carousel elements not found for Visualization 3");
    return;
  }

  carouselPrevButton.addEventListener("click", () => {
    updateCarouselMetrics();
    scrollToIndex(currentCarouselIndex - cardsPerView);
  });

  carouselNextButton.addEventListener("click", () => {
    updateCarouselMetrics();
    scrollToIndex(currentCarouselIndex + cardsPerView);
  });

  carouselViewport.addEventListener("scroll", () => {
    if (carouselSnapTimeout) clearTimeout(carouselSnapTimeout);
    carouselSnapTimeout = setTimeout(() => {
      if (!isProgrammaticCarouselScroll) {
        snapToNearestCard();
      }
    }, 120);
    updateCarouselButtons();
  });

  window.addEventListener("resize", () => {
    updateCarouselMetrics();
    scrollToIndex(currentCarouselIndex, "auto");
  });

  updateCarouselMetrics();
  updateCarouselButtons();
}

function updateCarouselButtons() {
  if (!carouselViewport || !carouselPrevButton || !carouselNextButton) return;

  const cards = carouselViewport.querySelectorAll(".city-building");
  if (!cards.length) {
    carouselPrevButton.disabled = true;
    carouselNextButton.disabled = true;
    return;
  }

  updateCarouselMetrics();

  const maxIndex = Math.max(0, cards.length - cardsPerView);
  carouselPrevButton.disabled = currentCarouselIndex <= 0;
  carouselNextButton.disabled = currentCarouselIndex >= maxIndex;
}

function updateCarouselMetrics() {
  if (!carouselViewport) return;
  const container = document.getElementById("buildings-container");
  if (!container) return;
  const firstCard = container.querySelector(".city-building");
  if (!firstCard) {
    cardsPerView = 1;
    cardWidthWithGap = 0;
    return;
  }

  const cardWidth = firstCard.getBoundingClientRect().width;
  const containerStyles = window.getComputedStyle(container);
  const gapValueRaw =
    containerStyles.columnGap || containerStyles.gap || containerStyles.rowGap || "0px";
  const gapValue = parseFloat(gapValueRaw) || 0;

  cardWidthWithGap = cardWidth + gapValue;

  if (cardWidthWithGap <= 0) {
    cardsPerView = 1;
    return;
  }

  cardsPerView = Math.max(
    1,
    Math.floor((carouselViewport.clientWidth + gapValue) / cardWidthWithGap)
  );
}

function resetCarouselPosition() {
  if (!carouselViewport) return;
  currentCarouselIndex = 0;
  scrollToIndex(0, "auto");
}

function scrollToIndex(targetIndex, behavior = "smooth") {
  if (!carouselViewport) return;
  const cards = carouselViewport.querySelectorAll(".city-building");

  if (!cards.length) {
    currentCarouselIndex = 0;
    carouselViewport.scrollTo({ left: 0, behavior: "auto" });
    updateCarouselButtons();
    return;
  }

  updateCarouselMetrics();

  const maxIndex = Math.max(0, cards.length - cardsPerView);
  const clampedIndex = Math.max(0, Math.min(targetIndex, maxIndex));
  currentCarouselIndex = clampedIndex;

  const targetCard = cards[clampedIndex];
  const maxScrollLeft = Math.max(
    0,
    carouselViewport.scrollWidth - carouselViewport.clientWidth
  );
  let scrollLeft = targetCard.offsetLeft;
  scrollLeft = Math.min(scrollLeft, maxScrollLeft);

  isProgrammaticCarouselScroll = true;
  carouselViewport.scrollTo({ left: scrollLeft, behavior });
  const releaseDelay = behavior === "auto" ? 120 : 350;
  setTimeout(() => {
    isProgrammaticCarouselScroll = false;
  }, releaseDelay);

  updateCarouselButtons();
}

function snapToNearestCard() {
  if (!carouselViewport || cardWidthWithGap <= 0) return;
  const cards = carouselViewport.querySelectorAll(".city-building");
  if (!cards.length) return;

  const approximateIndex = Math.round(carouselViewport.scrollLeft / cardWidthWithGap);
  scrollToIndex(approximateIndex);
}

// Setup filter event listeners
function setupFilterListeners() {
  const unitTypeFilter = document.getElementById("unit-type-filter");
  const vacancyFilter = document.getElementById("vacancy-filter");
  const rentFilter = document.getElementById("rent-filter");
  const sortFilter = document.getElementById("sort-filter");
  const resetButton = document.getElementById("reset-filters");

  if (!unitTypeFilter || !vacancyFilter || !rentFilter || !sortFilter || !resetButton) {
    console.error("Filter elements not found");
    return;
  }

  unitTypeFilter.addEventListener("change", (e) => {
    currentFilters.unitType = e.target.value;
    applyFilters();
  });

  vacancyFilter.addEventListener("change", (e) => {
    currentFilters.vacancy = e.target.value;
    applyFilters();
  });

  rentFilter.addEventListener("change", (e) => {
    currentFilters.rent = e.target.value;
    applyFilters();
  });

  sortFilter.addEventListener("change", (e) => {
    currentFilters.sort = e.target.value;
    applyFilters();
  });

  resetButton.addEventListener("click", () => {
    unitTypeFilter.value = "total";
    vacancyFilter.value = "all";
    rentFilter.value = "all";
    sortFilter.value = "population";
    currentFilters = {
      unitType: "total",
      vacancy: "all",
      rent: "all",
      sort: "population",
    };
    selectedCities = [];
    updateSelectedCitiesDisplay();
    applyFilters();
  });
}

// Setup city selector
function setupCitySelector() {
  const searchInput = document.getElementById("city-search");
  const cityDropdown = document.getElementById("city-dropdown");
  const provinceSelect = document.getElementById("province-select");
  const tabCities = document.getElementById("tab-cities");
  const tabProvinces = document.getElementById("tab-provinces");

  if (!searchInput || !cityDropdown || !provinceSelect || !tabCities || !tabProvinces) {
    console.error("City selector elements not found");
    return;
  }

  // Populate province dropdown
  populateProvinceDropdown();

  // Tab switching
  tabCities.addEventListener("click", () => {
    tabCities.classList.add("active");
    tabProvinces.classList.remove("active");
    searchInput.style.display = "block";
    provinceSelect.style.display = "none";
  });

  tabProvinces.addEventListener("click", () => {
    tabProvinces.classList.add("active");
    tabCities.classList.remove("active");
    searchInput.style.display = "none";
    provinceSelect.style.display = "block";
    cityDropdown.style.display = "none";
  });

  // Province selection
  provinceSelect.addEventListener("change", (e) => {
    const province = e.target.value;
    if (province) {
      selectProvinceCities(province);
      e.target.value = ""; // Reset dropdown
    }
  });

  // Show dropdown on focus
  searchInput.addEventListener("focus", () => {
    updateCityDropdown("");
    cityDropdown.style.display = "block";
  });

  // Search as user types
  searchInput.addEventListener("input", (e) => {
    const searchTerm = e.target.value;
    updateCityDropdown(searchTerm);
  });

  // Hide dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".city-selector-container")) {
      cityDropdown.style.display = "none";
    }
  });
}

// Populate province dropdown with all provinces
function populateProvinceDropdown() {
  const provinceSelect = document.getElementById("province-select");

  // Get unique provinces
  const provincesMap = new Map();
  allCitiesData.forEach((d) => {
    if (!provincesMap.has(d.province)) {
      const citiesInProvince = allCitiesData.filter(
        (c) => c.province === d.province
      );
      provincesMap.set(d.province, citiesInProvince.length);
    }
  });

  // Sort provinces by name
  const provinces = Array.from(provincesMap.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  // Add provinces to dropdown
  provinces.forEach(([province, count]) => {
    const option = document.createElement("option");
    option.value = province;
    option.textContent = `${province} (${count} cities)`;
    provinceSelect.appendChild(option);
  });
}

// Select all cities in a province
function selectProvinceCities(province) {
  // Get all cities in the province
  const citiesInProvince = allCitiesData
    .filter((d) => d.province === province)
    .map((d) => d.city);

  // Add all cities from this province to selection
  citiesInProvince.forEach((city) => {
    if (!selectedCities.includes(city)) {
      selectedCities.push(city);
    }
  });

  updateSelectedCitiesDisplay();
  applyFilters();
}

// Update city dropdown list
function updateCityDropdown(searchTerm) {
  const cityList = document.getElementById("city-list");
  const dropdown = document.getElementById("city-dropdown");

  // Get unique cities from ALL data (not filtered)
  const cityMap = new Map();
  allCitiesData.forEach((d) => {
    if (!cityMap.has(d.city)) {
      cityMap.set(d.city, d.province);
    }
  });

  let availableCities = Array.from(cityMap, ([name, province]) => ({
    name,
    province,
  }));

  // Filter by search term
  if (searchTerm) {
    availableCities = availableCities.filter(
      (city) =>
        city.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        city.province.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }

  cityList.innerHTML = "";

  // Add header
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

  // Group cities by province
  const citiesByProvince = new Map();
  availableCities.forEach((city) => {
    if (!citiesByProvince.has(city.province)) {
      citiesByProvince.set(city.province, []);
    }
    citiesByProvince.get(city.province).push(city);
  });

  // Sort provinces
  const sortedProvinces = Array.from(citiesByProvince.keys()).sort();

  // Display cities grouped by province
  sortedProvinces.forEach((province) => {
    // Province header
    const provinceHeader = document.createElement("div");
    provinceHeader.className = "province-group-header";
    provinceHeader.textContent = `${province} (${
      citiesByProvince.get(province).length
    })`;
    cityList.appendChild(provinceHeader);

    // Cities in this province (sorted alphabetically)
    const cities = citiesByProvince
      .get(province)
      .sort((a, b) => a.name.localeCompare(b.name));

    cities.forEach((city) => {
      const isSelected = selectedCities.includes(city.name);

      const option = document.createElement("div");
      option.className = "city-option";

      if (isSelected) option.classList.add("selected");

      // Create city name span
      const cityName = document.createElement("span");
      cityName.textContent = city.name;
      option.appendChild(cityName);

      // All cities are clickable
      option.addEventListener("click", () => {
        toggleCitySelection(city.name);
        document.getElementById("city-search").value = "";
        updateCityDropdown("");
      });

      cityList.appendChild(option);
    });
  });
}

// Toggle city selection
function toggleCitySelection(cityName) {
  const index = selectedCities.indexOf(cityName);

  if (index > -1) {
    // Remove city
    selectedCities.splice(index, 1);
  } else {
    // Add city (no limit)
    selectedCities.push(cityName);
  }

  updateSelectedCitiesDisplay();
  applyFilters();
}

// Update selected cities display
function updateSelectedCitiesDisplay() {
  const container = document.getElementById("selected-cities");
  container.innerHTML = "";

  if (selectedCities.length === 0) {
    container.innerHTML =
      '<div style="color: #718096; font-size: 0.9em; padding: 5px;">No cities selected - showing all</div>';
    return;
  }

  selectedCities.forEach((cityName) => {
    const tag = document.createElement("div");
    tag.className = "selected-city-tag";
    tag.innerHTML = `
            <span>${cityName}</span>
            <span class="remove-city" data-city="${cityName}">×</span>
        `;

    tag.querySelector(".remove-city").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleCitySelection(cityName);
    });

    container.appendChild(tag);
  });
}

// Apply current filters to the data
function applyFilters() {
  let filteredData = allCitiesData;

  console.log("applyFilters called, total cities:", filteredData.length);

  // Filter out cities that don't have data for the selected unit type
  const unitType = currentFilters.unitType;
  filteredData = filteredData.filter((d) => d.data && d.data[unitType]);
  console.log("After unit type filter:", filteredData.length, "cities");

  // City selection filter (highest priority)
  if (selectedCities.length > 0) {
    filteredData = filteredData.filter((d) => selectedCities.includes(d.city));
  }

  // Vacancy rate filter (using selected unit type)
  if (currentFilters.vacancy === "high") {
    filteredData = filteredData.filter(
      (d) => d.data[unitType].vacancy_rate > 2.0
    );
  } else if (currentFilters.vacancy === "low") {
    filteredData = filteredData.filter(
      (d) => d.data[unitType].vacancy_rate <= 2.0
    );
  }

  // Rent filter (using selected unit type)
  if (currentFilters.rent === "high") {
    filteredData = filteredData.filter((d) => d.data[unitType].avg_rent > 1500);
  } else if (currentFilters.rent === "medium") {
    filteredData = filteredData.filter(
      (d) =>
        d.data[unitType].avg_rent >= 1200 && d.data[unitType].avg_rent <= 1500
    );
  } else if (currentFilters.rent === "low") {
    filteredData = filteredData.filter((d) => d.data[unitType].avg_rent < 1200);
  }

  // Update visualization with filtered data
  createBuildingVisualization(filteredData);
}

function createBuildingVisualization(cities) {
  try {
    console.log("createBuildingVisualization called with", cities.length, "cities");
    const container = d3.select("#buildings-container");

    // Clear existing buildings
    container.html("");

    // Check if we have any cities to display
    if (!cities || cities.length === 0) {
      container.html(
        '<p style="color: #4a5568; text-align: center; width: 100%; padding: 40px;">No cities match the selected filters. Try adjusting your filter criteria.</p>'
      );
      resetCarouselPosition();
      return;
    }

    // Get the current unit type
    const unitType = currentFilters.unitType;
    console.log("Creating visualization for unit type:", unitType);

  // Apply sorting based on current filter
  switch (currentFilters.sort) {
    case "population":
      cities.sort((a, b) => b.population - a.population);
      break;
    case "vacancy-high":
      cities.sort(
        (a, b) => b.data[unitType].vacancy_rate - a.data[unitType].vacancy_rate
      );
      break;
    case "vacancy-low":
      cities.sort(
        (a, b) => a.data[unitType].vacancy_rate - b.data[unitType].vacancy_rate
      );
      break;
    case "rent-high":
      cities.sort(
        (a, b) => b.data[unitType].avg_rent - a.data[unitType].avg_rent
      );
      break;
    case "rent-low":
      cities.sort(
        (a, b) => a.data[unitType].avg_rent - b.data[unitType].avg_rent
      );
      break;
    case "name":
      cities.sort((a, b) => a.city.localeCompare(b.city));
      break;
    default:
      cities.sort((a, b) => b.population - a.population);
  }

  // Calculate scales
  const maxPopulation = d3.max(cities, (d) => d.population);
  const minPopulation = d3.min(cities, (d) => d.population);
  const maxRent = d3.max(cities, (d) => d.data[unitType].avg_rent);
  const minRent = d3.min(cities, (d) => d.data[unitType].avg_rent);

  const populationScale = d3
    .scaleLinear()
    .domain([minPopulation, maxPopulation])
    .range([16, 48]);

  const chimneyHeightScale = d3
    .scaleLinear()
    .domain([minRent, maxRent])
    .range([40, 100]);

  cities.forEach((city) => {
    const totalWindows = Math.round(populationScale(city.population));
    const cols = 4;

    // Get data for selected unit type
    const cityData = city.data[unitType];
    const vacancyRate = cityData.vacancy_rate;
    const avgRent = cityData.avg_rent;

    // Calculate exact vacancy - including fractional part
    const exactVacantWindows = totalWindows * (vacancyRate / 100);
    const fullVacantCount = Math.floor(exactVacantWindows);
    const partialVacantPercent = exactVacantWindows - fullVacantCount;

    const fullOccupiedCount = Math.floor(totalWindows - exactVacantWindows);
    const hasPartialWindow = partialVacantPercent > 0;

    // Create building container
    const buildingDiv = container.append("div").attr("class", "city-building");

    // Chimney container
    const chimneyContainer = buildingDiv
      .append("div")
      .attr("class", "smoke-container");

    // Add chimney with variable height based on rent
    const chimneyHeight = Math.round(chimneyHeightScale(avgRent));
    const chimney = chimneyContainer
      .append("div")
      .attr("class", "chimney")
      .style("height", `${chimneyHeight}px`);

    // Add dollar sign inside chimney
    chimney.append("div").attr("class", "chimney-dollar").text("$");

    // Building structure
    const building = buildingDiv.append("div").attr("class", "building");

    const windowsGrid = building
      .append("div")
      .attr("class", "windows-grid")
      .style("grid-template-columns", `repeat(${cols}, 1fr)`);

    // Create windows array with occupied, vacant, and partial
    const windows = [];

    // Add fully occupied windows
    for (let i = 0; i < fullOccupiedCount; i++) {
      windows.push({ type: "occupied", fill: 1.0 });
    }

    // Add partially filled window if needed
    if (hasPartialWindow) {
      windows.push({ type: "partial", fill: 1 - partialVacantPercent });
    }

    // Add fully vacant windows
    for (let i = 0; i < fullVacantCount; i++) {
      windows.push({ type: "vacant", fill: 0 });
    }

    // Shuffle the windows array
    for (let i = windows.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [windows[i], windows[j]] = [windows[j], windows[i]];
    }

    // Add windows to grid
    windows.forEach((window, index) => {
      const windowDiv = windowsGrid
        .append("div")
        .attr("class", `window ${window.type}`)
        .attr(
          "title",
          window.type === "occupied"
            ? "Occupied unit"
            : window.type === "vacant"
            ? "Vacant unit"
            : `Partially occupied (${Math.round(window.fill * 100)}%)`
        );

      // For partial windows, create a gradient fill
      if (window.type === "partial") {
        const fillPercent = window.fill * 100;
        windowDiv.style(
          "background",
          `linear-gradient(to top, #f6ad55 0%, #ed8936 ${fillPercent}%, #e2e8f0 ${fillPercent}%, #e2e8f0 100%)`
        );
      }
    });

    // City label
    const isHighVacancy = vacancyRate > 2.0;
    const label = buildingDiv
      .append("div")
      .attr("class", isHighVacancy ? "city-label high-vacancy" : "city-label");

    label.append("div").attr("class", "city-name").text(city.city);

    // Helper function to get unit type label
    const getUnitTypeLabel = () => {
      const labels = {
        bachelor: "Bachelor",
        "1_bedroom": "1 Bedroom",
        "2_bedroom": "2 Bedroom",
        "3_bedroom_plus": "3+ Bedroom",
        total: "All Units",
      };
      return labels[unitType] || "All Units";
    };

    label.append("div").attr("class", "city-stats").html(`
                ${
                  city.year
                    ? `<div><strong>Year:</strong> ${city.year}</div>`
                    : ""
                }
                <div><strong>Unit Type:</strong> ${getUnitTypeLabel()}</div>
                <div><strong>Vacancy:</strong> ${vacancyRate}%</div>
                <div><strong>Avg Rent:</strong> $${Math.round(avgRent)}</div>
                <div><strong>Pop:</strong> ${formatPopulation(
                  city.population
                )}</div>
            `);

    // Keep green background for high vacancy cities, but don't show badge text
    // The green styling is applied via the 'high-vacancy' class on the label
  });

  console.log("Visualization created successfully with", cities.length, "buildings");
  resetCarouselPosition();

  } catch (error) {
    console.error("Error in createBuildingVisualization:", error);
    const container = d3.select("#buildings-container");
    container.html(
      '<p style="color: #ff6b6b; text-align: center; width: 100%; padding: 40px;">Error creating visualization: ' + error.message + '</p>'
    );
  }
}

function formatPopulation(pop) {
  if (pop >= 1000000) {
    return (pop / 1000000).toFixed(1) + "M";
  } else if (pop >= 1000) {
    return Math.round(pop / 1000) + "K";
  }
  return pop.toString();
}
