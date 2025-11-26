
// Start application by loading the data

let currTabNum = 0
let pageCount = 1;
let popChart;
let cleanedPopData;
let incomeRentData;
let incomeVisData;

loadData();

function loadData() {
    d3.csv("data/avg_rent_by_pop.csv"). then(data=>{
        cleanedPopData = preparePopRentData(data);
        popChart = new PopulationRentChart("vis5-area", "vis5-city-search", "vis5-city-list", "vis5-city-dropdown", "vis5-area-list", 
                                            "vis5-selected-cities", cleanedPopData)

        // Load and create the building visualization
        d3.json("data/BURAK_cities_vacancy_multi_year.json").then(data => {
            initVacancyVis(data);
            initControl()

            Promise.all([
                d3.csv("data/jeff/rent-prices.csv").then(rows => rows.map(row => mapRowBySchema(row, RENT_DATA_MAP))),
                d3.csv("data/jeff/income-data.csv").then(rows => reshapeIncomeData(rows))
            ]).then(([rawRentData, rawIncomeData]) => {
                incomeRentData = rawRentData;
                incomeVisData = rawIncomeData;
            }).catch(error => {
                console.error("Failed to load income/rent datasets", error);
            });
        }).catch(error => {
            console.error('Error loading data:', error);
            document.getElementById('buildings-container').innerHTML =
                '<p style="color: #ff6b6b; text-align: center;">Error loading visualization data.</p>';
        });
    })

}

function preparePopRentData(data){
    cleaned_data = []

    data.forEach(e => {
        let loc = e.GEO;

        let index = loc.indexOf(",");
        let city = loc.slice(0, index);
        let dataObj = {structure: e["Type of structure"], unit: e["Type of unit"], avg: +e.VALUE}

        if (cleaned_data.length > 0 && cleaned_data[cleaned_data.length - 1].city == city) {
            cleaned_data[cleaned_data.length - 1].data.push(dataObj)
        }   else    {
            let province = loc.slice(index + 2);
            let locObj = {year: e.REF_DATE, city: city, province: province, pop: +e.POP, data: [dataObj]};
            cleaned_data.push(locObj)
        }        
    });
    return cleaned_data;
}

function initControl()  {

    // idk why but select by id doesnt work
    for (let i = 0; i < 8; i++) {
        let currTab = d3.select('[data-target="vis' + i + '"]');
        currTab.on("click", function() {
            changePage(i)
        });
        }
    let rightBend = d3.select('#right-bend');
    rightBend.on("click", function() {
        changePage(1, 0)
    })
    
    // Initialize drag-to-flip functionality
    initCornerDrag();
}

function initCornerDrag() {
    const rightCorner = document.getElementById('right-bend');
    const leftCorner = document.getElementById('left-bend');
    const folderPage = document.getElementById('folder-page');
    
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let dragDistance = 0;
    let currentCorner = null;
    const dragThreshold = 100; // pixels to drag before flipping
    
    function handleDragStart(e, corner, direction) {
        isDragging = true;
        currentCorner = corner;
        const touch = e.touches ? e.touches[0] : e;
        startX = touch.clientX;
        startY = touch.clientY;
        dragDistance = 0;
        
        corner.style.cursor = 'grabbing';
        corner.style.transition = 'none';
        folderPage.style.transition = 'none';
        
        e.preventDefault();
    }
    
    function handleDragMove(e) {
        if (!isDragging || !currentCorner) return;
        
        const touch = e.touches ? e.touches[0] : e;
        const deltaX = touch.clientX - startX;
        const deltaY = touch.clientY - startY;
        
        // Determine if it's right or left corner
        const isRightCorner = currentCorner.id === 'right-bend';
        
        // Only allow dragging in the correct direction
        if (isRightCorner && deltaX < 0) {
            dragDistance = Math.abs(deltaX);
        } else if (!isRightCorner && deltaX > 0) {
            dragDistance = Math.abs(deltaX);
        } else {
            dragDistance = 0;
        }
        
        // Visual feedback - scale up the corner as you drag
        const scale = 1 + (dragDistance / dragThreshold) * 0.5;
        const clampedScale = Math.min(scale, 1.5);
        currentCorner.style.transform = `scale(${clampedScale})`;
        
        // Add page curl effect
        const curlAmount = Math.min(dragDistance / 2, 100);
        if (isRightCorner) {
            folderPage.style.transform = `perspective(2000px) rotateY(-${curlAmount * 0.1}deg)`;
        } else {
            folderPage.style.transform = `perspective(2000px) rotateY(${curlAmount * 0.1}deg)`;
        }
        
        e.preventDefault();
    }
    
    function handleDragEnd(e) {
        if (!isDragging || !currentCorner) return;
        
        const isRightCorner = currentCorner.id === 'right-bend';
        
        // Reset visual state with animation
        currentCorner.style.transition = 'transform 0.3s ease';
        currentCorner.style.transform = 'scale(1)';
        currentCorner.style.cursor = 'pointer';
        
        folderPage.style.transition = 'transform 0.5s ease';
        
        // If dragged far enough, flip the page
        if (dragDistance >= dragThreshold) {
            // Add flipping class to fade out content
            folderPage.classList.add('flipping');
            
            // Add flip animation
            const flipDirection = isRightCorner ? -180 : 180;
            folderPage.style.transform = `perspective(2000px) rotateY(${flipDirection}deg)`;
            
            // Wait for animation, then change page
            setTimeout(() => {
                if (isRightCorner) {
                    changePage(currTabNum + 1);
                } else {
                    changePage(currTabNum - 1);
                }
                // Reset transform after page change
                folderPage.style.transition = 'none';
                folderPage.style.transform = 'perspective(2000px) rotateY(0deg)';
                folderPage.classList.remove('flipping');
                setTimeout(() => {
                    folderPage.style.transition = 'transform 0.5s ease';
                }, 50);
            }, 300);
        } else {
            // Reset if not dragged far enough
            folderPage.style.transform = 'perspective(2000px) rotateY(0deg)';
        }
        
        isDragging = false;
        currentCorner = null;
        dragDistance = 0;
        
        e.preventDefault();
    }
    
    // Mouse events
    rightCorner.addEventListener('mousedown', (e) => handleDragStart(e, rightCorner, 'next'));
    leftCorner.addEventListener('mousedown', (e) => handleDragStart(e, leftCorner, 'prev'));
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
    
    // Touch events for mobile
    rightCorner.addEventListener('touchstart', (e) => handleDragStart(e, rightCorner, 'next'));
    leftCorner.addEventListener('touchstart', (e) => handleDragStart(e, leftCorner, 'prev'));
    document.addEventListener('touchmove', handleDragMove, { passive: false });
    document.addEventListener('touchend', handleDragEnd);
}

function changePage(page)   {
    let leftBend = d3.select('#left-bend');
    let rightBend = d3.select('#right-bend');
    if (page == 0)  {
        rightBend.style("display", "block")
        leftBend.style("display", "none")
    }   else if (page == 7) {
        leftBend.style("display", "block")
        rightBend.style("display", "none")
    }   else    {
        leftBend.style("display", "block")
        rightBend.style("display", "block")
    }
    leftBend.on("click", function() {
        changePage(page - 1, page)
    })
    rightBend.on("click", function() {
        changePage(page + 1, page)
    })


    let currTab = d3.select('[data-target="vis' + currTabNum + '"]');
    currTab.attr("class", "tab")

    let newTab = d3.select('[data-target="vis' + page + '"]');
    newTab.attr("class", "tab active-tab")

    let currVis = d3.select('[data-content="vis' + currTabNum + '"]');
    currVis.attr("class", "content")

    let newVis = d3.select('[data-content="vis' + page + '"]');
    newVis.attr("class", "content active")

    if (currTabNum != page) {
        if (currTabNum == 1)    {
            // Cleanup mortgage visualization
            if (typeof destructMortgageVisualization !== 'undefined') {
                destructMortgageVisualization();
            }
        }   else if (currTabNum == 3)    {
            destructIncomeVis();
        }   else if (currTabNum == 4)   {
            popChart.destructVis();
        }   else if (currTabNum == 6)   {
            // Destruct construction vis if needed
        }

        currTabNum = page;
        if (page == 1)  {
            // Initialize mortgage visualization (vis1)
            if (typeof initMortgageVisualization !== 'undefined') {
                initMortgageVisualization();
            }
        }   else if (page == 3)  {
            initIncomeVis(incomeRentData, incomeVisData);
        }   else if (page == 4)  {
            popChart.initVis();
        }   else if (page == 6)  {
            initConstructionVisualization();
        }   

        pageCount += 1;
        if (pageCount < 8)  {
            let nextTab = d3.select('[data-target="vis' + pageCount + '"]');
            nextTab.style("display", "block")
        }
    }


}

// Initialize the housing units map visualization
initCityMap();
