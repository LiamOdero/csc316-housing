// Set current year in footer
//document.getElementById('current-year').textContent = new Date().getFullYear();

// Province name mapping
const provinceNames = {
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
  "Sask.": "Saskatchewan"
};

function getFullProvinceName(abbreviation) {
  return provinceNames[abbreviation] || abbreviation;
}

// Global variables
let allCitiesData = [];
let selectedCities = [];
let currentFilters = {
  year: "2023",
  vacancy: "all",
  sort: "custom",
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

function initVacancyVis(data) {
    allCitiesData = data;
    setupCitySelector();
    setupFilterListeners();
    applyFilters();
}

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
        //snapToNearestCard();
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
  const yearFilter = document.getElementById("year-filter");
  const vacancyFilter = document.getElementById("vacancy-filter");
  const sortFilter = document.getElementById("sort-filter");
  const resetButton = document.getElementById("reset-filters");

  if (!yearFilter || !vacancyFilter || !sortFilter || !resetButton) {
    console.error("Filter elements not found");
    return;
  }

  yearFilter.addEventListener("input", (e) => {
    currentFilters.year = e.target.value;
    document.getElementById("year-display").textContent = e.target.value;
    applyFilters();
  });

  vacancyFilter.addEventListener("change", (e) => {
    currentFilters.vacancy = e.target.value;
    applyFilters();
  });

  sortFilter.addEventListener("change", (e) => {
    currentFilters.sort = e.target.value;
    applyFilters();
  });

  resetButton.addEventListener("click", () => {
    yearFilter.value = "2023";
    document.getElementById("year-display").textContent = "2023";
    vacancyFilter.value = "all";
    sortFilter.value = "custom";
    currentFilters = {
      year: "2023",
      vacancy: "all",
      sort: "custom",
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
    option.textContent = `${getFullProvinceName(province)} (${count} cities)`;
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
    provinceHeader.textContent = `${getFullProvinceName(province)} (${
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
  const selectedYear = parseInt(currentFilters.year);

  // Convert multi-year data to single-year format
  let filteredData = allCitiesData.map(city => {
    // Find the vacancy rate for the selected year
    const yearData = city.years.find(y => y.year === selectedYear);

    if (!yearData) {
      return null; // City doesn't have data for this year
    }

    return {
      city: city.city,
      province: city.province,
      population: city.population,
      year: selectedYear,
      vacancy_rate: yearData.vacancy_rate
    };
  }).filter(d => d !== null); // Remove cities without data for selected year

  // City selection filter (highest priority)
  if (selectedCities.length > 0) {
    filteredData = filteredData.filter((d) => selectedCities.includes(d.city));
  }

  // Vacancy rate filter
  if (currentFilters.vacancy === "high") {
    filteredData = filteredData.filter((d) => d.vacancy_rate > 2.0);
  } else if (currentFilters.vacancy === "low") {
    filteredData = filteredData.filter((d) => d.vacancy_rate <= 2.0);
  }

  // Update visualization with filtered data
  createBuildingVisualization(filteredData);
}

function createBuildingVisualization(cities) {
  try {
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

  // Apply sorting based on current filter
  switch (currentFilters.sort) {
    case "custom":
      // Major cities first (by importance/population), then others
      const majorCities = [
        "Toronto", "Montréal", "Vancouver", "Calgary", "Edmonton",
        "Winnipeg", "Hamilton", "London", "Halifax", "Windsor",
        "Oshawa", "Victoria", "Saskatoon", "Regina", "Kelowna",
        "Sherbrooke", "St. John's", "Trois-Rivières", "Lethbridge",
        "Red Deer", "Charlottetown", "Wood Buffalo", "Prince Albert",
        "Bathurst", "Fort St. John", "Squamish", "Petawawa",
        "Camrose", "Swift Current", "Estevan"
      ];

      cities.sort((a, b) => {
        const indexA = majorCities.indexOf(a.city);
        const indexB = majorCities.indexOf(b.city);

        // If both are in the list, sort by their position
        if (indexA !== -1 && indexB !== -1) {
          return indexA - indexB;
        }
        // If only A is in the list, A comes first
        if (indexA !== -1) return -1;
        // If only B is in the list, B comes first
        if (indexB !== -1) return 1;
        // If neither is in the list, sort alphabetically
        return a.city.localeCompare(b.city);
      });
      break;
    case "vacancy-high":
      cities.sort((a, b) => b.vacancy_rate - a.vacancy_rate);
      break;
    case "vacancy-low":
      cities.sort((a, b) => a.vacancy_rate - b.vacancy_rate);
      break;
    case "name":
      cities.sort((a, b) => a.city.localeCompare(b.city));
      break;
    default:
      // Default to custom sort
      cities.sort((a, b) => b.population - a.population);
  }

  cities.forEach((city) => {
    // Fixed number of windows for all cities
    const totalWindows = 32;
    const cols = 4;

    // Get vacancy rate
    const vacancyRate = city.vacancy_rate;

    // Calculate vacant windows (rounded to nearest whole number)
    const vacantCount = Math.round(totalWindows * (vacancyRate / 100));
    const occupiedCount = totalWindows - vacantCount;

    // Create building container
    const buildingDiv = container.append("div").attr("class", "city-building");

    // Building structure
    const building = buildingDiv.append("div").attr("class", "building");

    const windowsGrid = building
      .append("div")
      .attr("class", "windows-grid")
      .style("grid-template-columns", `repeat(${cols}, 1fr)`);

    // Create windows array - always exactly 32 windows
    const windows = [];

    // Add vacant windows first (so they appear at top-left)
    for (let i = 0; i < vacantCount; i++) {
      windows.push({ type: "vacant" });
    }

    // Add occupied windows after
    for (let i = 0; i < occupiedCount; i++) {
      windows.push({ type: "occupied" });
    }

    // Add windows to grid - always exactly 32 windows
    windows.forEach((window, index) => {
      windowsGrid
        .append("div")
        .attr("class", `window ${window.type}`);
    });

    // City label
    const isHighVacancy = vacancyRate > 2.0;
    const label = buildingDiv
      .append("div")
      .attr("class", isHighVacancy ? "city-label high-vacancy" : "city-label");

    label.append("div").attr("class", "city-name").text(city.city);

    label.append("div").attr("class", "city-stats").html(`
                ${
                  city.year
                    ? `<div><strong>Year:</strong> ${city.year}</div>`
                    : ""
                }
                <div><strong>Vacancy:</strong> ${vacancyRate}%</div>
            `);

    // Keep green background for high vacancy cities, but don't show badge text
    // The green styling is applied via the 'high-vacancy' class on the label
  });

  resetCarouselPosition();

  } catch (error) {
    console.error("Error in createBuildingVisualization:", error);
    const container = d3.select("#buildings-container");
    container.html(
      '<p style="color: #ff6b6b; text-align: center; width: 100%; padding: 40px;">Error creating visualization: ' + error.message + '</p>'
    );
  }
}

