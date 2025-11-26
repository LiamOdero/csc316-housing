// Simplified income vs rent visualization (single-SVG layout)
// income 9e9e9eff
// rent c1121f
(() => {
    const RENT_COLOR = '#c1121f';
    const INCOME_COLOR = '#9e9e9eff';
    const MIN_WIDTH = 1100;
    const MIN_HEIGHT = 720;
    const INFO_WIDTH = 320;
    const INFO_GAP = 28;

    const formatMoney = value => `$${d3.format(',.0f')(value)}`;
    const formatPercent = value => `${d3.format('.1f')(value)}%`;

    const normalizeCityName = value => {
        if (typeof value !== 'string') return '';
        return value
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '');
    };

    const parseCityParts = value => {
        if (typeof value !== 'string') return { city: value, province: '' };
        const [cityPart, provincePart = ''] = value.split(',');
        return { city: cityPart.trim(), province: provincePart.trim() };
    };

    class IncomeRentV2 {
        constructor(config) {
            this.parentSelector = config.parentElement;
            this.parent = d3.select(this.parentSelector);
            this.precomputedInput = config.precomputedData || null;
            this.seriesColors = { income: INCOME_COLOR, rent: RENT_COLOR };
            this.margin = { top: 44, right: 16, bottom: 48, left: 68 };
            this.infoWidth = INFO_WIDTH;
            this.infoGap = INFO_GAP;
            this.infoRowsLimit = 10;
            this.selectedCity = null;
            this.precomputedByFamily = new Map();
            this.globalSeriesMax = null;
            this.maxByFamily = new Map();
            this.axesRendered = false;
            this.preferredCityLabels = [
                'Vancouver',
                'Toronto',
                'Halifax',
                'Calgary',
                'Winnipeg',
                'Moncton',
                'Saskatoon',
                'Charlottetown',
                'Montréal',
                "St. John's"
            ];
            this.cityLabelLookup = new Map();

            this.loadPrecomputed(this.precomputedInput || {});
        }

        init() {
            if (!this.parent.node()) {
                console.warn('IncomeRentV2: parent element not found');
                return;
            }
            this.renderBase();
            this.update();
        }

        renderBase() {
            this.parent.selectAll('*').remove();
            const bounds = this.parent.node().getBoundingClientRect();
            const baseWidth = Math.max(bounds.width || 0, MIN_WIDTH);
            const baseHeight = Math.max(bounds.height || 0, MIN_HEIGHT);

            this.chartHeight = baseHeight - this.margin.top - this.margin.bottom;
            this.chartWidth = Math.max(
                baseWidth - this.margin.left - this.margin.right - this.infoGap - this.infoWidth,
                420
            );
            this.width = this.margin.left + this.chartWidth + this.infoGap + this.infoWidth + this.margin.right;
            this.height = this.margin.top + this.chartHeight + this.margin.bottom;

            this.svg = this.parent.append('svg')
                .attr('width', this.width)
                .attr('height', this.height);

            this.chartGroup = this.svg.append('g')
                .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

            this.infoGroup = this.svg.append('g')
                .attr('transform', `translate(${this.margin.left + this.chartWidth + this.infoGap},${this.margin.top})`);

            this.xScale = d3.scaleLinear().range([0, this.chartWidth]);
            this.yScale = d3.scaleLinear().range([this.chartHeight, 0]);

            this.xAxisGroup = this.chartGroup.append('g')
                .attr('class', 'axis axis-x')
                .attr('transform', `translate(0,${this.chartHeight})`);

            this.yAxisGroup = this.chartGroup.append('g')
                .attr('class', 'axis axis-y');

            this.seriesGroup = this.chartGroup.append('g').attr('class', 'series-group');
            this.legendGroup = this.chartGroup.append('g').attr('class', 'legend-group');
            this.legendBg = this.chartGroup.append('rect')
                .attr('class', 'legend-bg')
                .attr('fill', '#ffffff')
                .attr('stroke', '#e5e7eb')
                .attr('rx', 8)
                .attr('ry', 8)
                .attr('opacity', 0.9);
            this.lastLegendSignature = null;

            this.chartTitle = this.chartGroup.append('text')
                .attr('class', 'chart-title')
                .attr('x', this.chartWidth / 2)
                .attr('y', -16)
                .attr('text-anchor', 'middle')
                .attr('font-weight', 700)
                .attr('font-size', 16)
                .attr('fill', '#111827')
                .text('Average monthly income vs rent for the largest cities in each province');

            this.yearMarker = this.chartGroup.append('line')
                .attr('class', 'year-marker-line')
                .attr('y1', 0)
                .attr('y2', this.chartHeight)
                .attr('stroke', '#9ca3af')
                .attr('stroke-width', 1.5)
                .attr('stroke-dasharray', '4 3');
            this.hoverMarker = this.chartGroup.append('line')
                .attr('class', 'hover-marker-line')
                .attr('y1', 0)
                .attr('y2', this.chartHeight)
                .attr('stroke', '#c1121f')
                .attr('stroke-width', 1.2)
                .attr('stroke-dasharray', '3 3')
                .style('opacity', 0);

            this.infoTitle = this.infoGroup.append('text')
                .attr('class', 'info-title')
                .attr('x', 0)
                .attr('y', -12)
                .attr('font-weight', 700)
                .attr('font-size', 16)
                .attr('fill', '#111827');

            this.infoRows = this.infoGroup.append('g')
                .attr('class', 'info-rows')
                .attr('transform', 'translate(0, 24)');

            this.chartOverlay = this.chartGroup.append('rect')
                .attr('class', 'chart-overlay')
                .attr('x', 0)
                .attr('y', 0)
                .attr('width', this.chartWidth)
                .attr('height', this.chartHeight)
                .attr('fill', 'transparent')
                .style('pointer-events', 'all')
                .on('click', event => this.handleChartClick(event))
                .on('mousemove', event => this.handleHover(event))
                .on('mouseleave', () => this.hideHover());
        }

        buildSeries() {
            const data = this.precomputedByFamily.get(this.selectedFamily) || this.precomputedByFamily.values().next().value;
            const incomeSeries = data ? data.avgIncomeSeries : [];
            const rentSeries = data ? data.avgRentSeries : [];
            const series = [
                {
                    key: 'income',
                    label: 'Average monthly income (largest city per province)',
                    color: this.seriesColors.income,
                    values: incomeSeries,
                    isAverage: true
                },
                {
                    key: 'rent',
                    label: 'Average monthly rent (largest city per province)',
                    color: this.seriesColors.rent,
                    values: rentSeries,
                    isAverage: true
                }
            ];

            if (this.selectedCity && data) {
                const cityLabel = parseCityParts(this.selectedCity).city;
                const cityIncome = data.citySeriesByCity?.get(this.selectedCity)?.income || [];
                const cityRent = data.citySeriesByCity?.get(this.selectedCity)?.rent || [];
                const hasIncome = cityIncome.some(v => Number.isFinite(v.value));
                const hasRent = cityRent.some(v => Number.isFinite(v.value));
                if (hasIncome) {
                    series.push({
                        key: 'selected-income',
                        label: `Income in ${cityLabel}`,
                        color: this.seriesColors.income,
                        values: cityIncome,
                        isAverage: false
                    });
                }
                if (hasRent) {
                    series.push({
                        key: 'selected-rent',
                        label: `Rent in ${cityLabel}`,
                        color: this.seriesColors.rent,
                        values: cityRent,
                        isAverage: false
                    });
                }
            }

            return series;
        }

        buildCityRows(year) {
            const data = this.precomputedByFamily.get(this.selectedFamily);
            const baseRows = data?.cityRowsByYear.get(Number(year)) || [];
            const rows = baseRows.map(r => ({
                ...r,
                isSelected: !r.isAverage && this.selectedCity && r.city === this.selectedCity
            }));
            return rows.slice(0, this.infoRowsLimit);
        }

        updateLegend(series) {
            const signature = series.map(s => `${s.key}-${s.label}-${s.isAverage ? 'avg' : 'city'}`).join('|');
            if (signature === this.lastLegendSignature) {
                return;
            }
            this.lastLegendSignature = signature;

            const legend = this.legendGroup.selectAll('.legend-item').data(series, d => d.key);
            const enter = legend.enter().append('g').attr('class', 'legend-item');
            enter.append('line')
                .attr('class', 'legend-line')
                .attr('x1', 0)
                .attr('x2', 18)
                .attr('y1', 7)
                .attr('y2', 7)
                .attr('stroke-width', 4);
            enter.append('text')
                .attr('x', 24)
                .attr('y', 12)
                .attr('font-size', 14)
                .attr('fill', '#111827')
                .attr('font-weight', 600);
            const merged = enter.merge(legend)
                .attr('transform', (d, i) => `translate(12, ${i * 22})`);
            merged.select('.legend-line')
                .attr('stroke', d => d.color)
                .attr('stroke-dasharray', d => d.isAverage ? '4 3' : null);
            merged.select('text').text(d => d.label);
            legend.exit().remove();

            const bbox = this.legendGroup.node()?.getBBox();
            if (bbox && this.legendBg) {
                const pad = 8;
                const xPos = 12;
                const yPos = 24;
                this.legendBg
                    .attr('x', xPos)
                    .attr('y', yPos)
                    .attr('width', bbox.width + pad * 4)
                    .attr('height', bbox.height + pad * 2)
                    .style('display', null);
                this.legendGroup.attr('transform', `translate(${xPos + pad}, ${yPos + pad})`);
                this.legendBg.raise();
                this.legendGroup.raise();
            }
        }

        update() {
            if (!this.svg) return;

            const series = this.buildSeries();
            const yMax = (() => {
                const familyMax = this.maxByFamily.get(this.selectedFamily);
                if (Number.isFinite(familyMax) && familyMax > 0) return familyMax * 1.15;
                const globalMax = Number.isFinite(this.globalSeriesMax) ? this.globalSeriesMax : null;
                if (globalMax !== null && globalMax > 0) return globalMax * 1.15;
                const allValuesFallback = series.flatMap(s => s.values.map(v => v.value).filter(Number.isFinite));
                return allValuesFallback.length ? d3.max(allValuesFallback) * 1.15 : 1000;
            })();
            this.xScale.domain([d3.min(this.availableYears) || 2000, d3.max(this.availableYears) || 2023]);
            this.yScale.domain([0, yMax]);

            const xAxis = d3.axisBottom(this.xScale)
                .tickValues(this.availableYears)
                .tickFormat(d3.format('d'));
            const yAxis = d3.axisLeft(this.yScale)
                .ticks(6)
                .tickFormat(d => `$${d3.format(',')(Math.round(d))}`);
            const axisTransition = this.axesRendered
                ? d3.transition().duration(350).ease(d3.easeCubicOut)
                : null;
            if (axisTransition) {
                this.xAxisGroup.transition(axisTransition).call(xAxis);
                this.yAxisGroup.transition(axisTransition).call(yAxis);
            } else {
                this.xAxisGroup.call(xAxis);
                this.yAxisGroup.call(yAxis);
                this.axesRendered = true;
            }

            const lineGen = d3.line()
                .defined(d => Number.isFinite(d.value))
                .x(d => this.xScale(d.year))
                .y(d => this.yScale(d.value));
            const lineTransition = d3.transition().duration(450).ease(d3.easeCubicOut);

            const seriesSel = this.seriesGroup.selectAll('.series').data(series, d => d.key);
            const seriesEnter = seriesSel.enter().append('g').attr('class', 'series');
            seriesEnter.append('path').attr('class', 'series-line').attr('fill', 'none');
            const mergedSeries = seriesEnter.merge(seriesSel);

            mergedSeries.select('.series-line')
                .transition(lineTransition)
                .attr('stroke', d => d.color)
                .attr('stroke-width', 2.4)
                .attr('stroke-dasharray', d => d.isAverage ? '4 3' : null)
                .attr('d', d => lineGen(d.values));

            seriesSel.exit().remove();

            const markerData = series.map(s => {
                const match = s.values.find(v => Number(v.year) === Number(this.selectedYear));
                return {
                    key: s.key,
                    color: s.color,
                    value: match ? match.value : null,
                    year: this.selectedYear
                };
            }).filter(d => Number.isFinite(d.value));

            const markers = this.seriesGroup.selectAll('.series-marker').data(markerData, d => d.key);
            const markersEnter = markers.enter().append('circle')
                .attr('class', 'series-marker')
                .attr('r', 4);
            markersEnter.merge(markers)
                .attr('cx', d => this.xScale(d.year))
                .attr('cy', d => this.yScale(d.value))
                .attr('fill', d => d.color)
                .attr('stroke', '#111')
                .attr('stroke-width', 1);
            markers.exit().remove();

            const markerX = this.xScale(Number(this.selectedYear));
            this.yearMarker
                .attr('x1', markerX)
                .attr('x2', markerX);
            if (this.hoverMarker) {
                this.hoverMarker.attr('y2', this.chartHeight);
            }

            this.updateLegend(series);
            this.updateInfoPanel();
        }

        loadPrecomputed(precomputed) {
            const data = typeof precomputed === 'string' ? JSON.parse(precomputed) : precomputed;
            const years = Array.isArray(data.years) ? data.years.map(Number).sort((a, b) => a - b) : [];
            this.availableYears = years;
            this.familyTypes = Array.isArray(data.familyTypes) ? data.familyTypes : [];
            this.selectedFamily = this.familyTypes[0] || null;
            this.selectedYear = years.length ? years[years.length - 1] : null;
            this.maxByFamily.clear();
            this.globalSeriesMax = null;

            const citySet = new Set();
            Object.values(data.data || {}).forEach(familyEntry => {
                const citySeries = familyEntry.citySeriesByCity || {};
                Object.keys(citySeries).forEach(city => citySet.add(city));
            });
            this.cities = Array.from(citySet).sort();
            this.cities.forEach(cityKey => {
                const parts = parseCityParts(cityKey);
                const norm = normalizeCityName(parts.city);
                if (norm && !this.cityLabelLookup.has(norm)) {
                    this.cityLabelLookup.set(norm, cityKey);
                }
            });

            let globalMax = null;
            const registerGlobal = value => {
                const num = Number(value);
                if (!Number.isFinite(num)) return;
                globalMax = globalMax === null ? num : Math.max(globalMax, num);
            };

            Object.entries(data.data || {}).forEach(([family, payload]) => {
                let familyMax = null;
                const registerValue = value => {
                    const num = Number(value);
                    if (!Number.isFinite(num)) return;
                    familyMax = familyMax === null ? num : Math.max(familyMax, num);
                    registerGlobal(num);
                };

                const cityRowsMap = new Map();
                Object.entries(payload.cityRowsByYear || {}).forEach(([year, rows]) => {
                    cityRowsMap.set(Number(year), rows);
                });
                const citySeriesMap = new Map();
                Object.entries(payload.citySeriesByCity || {}).forEach(([city, series]) => {
                    const incomeSeries = series.income || [];
                    const rentSeries = series.rent || [];
                    incomeSeries.forEach(point => registerValue(point?.value));
                    rentSeries.forEach(point => registerValue(point?.value));
                    citySeriesMap.set(city, {
                        income: incomeSeries,
                        rent: rentSeries
                    });
                });

                (payload.avgIncomeSeries || []).forEach(point => registerValue(point?.value));
                (payload.avgRentSeries || []).forEach(point => registerValue(point?.value));
                registerValue(payload.maxValue);

                this.precomputedByFamily.set(family, {
                    avgIncomeSeries: payload.avgIncomeSeries || [],
                    avgRentSeries: payload.avgRentSeries || [],
                    cityRowsByYear: cityRowsMap,
                    citySeriesByCity: citySeriesMap
                });
                if (familyMax !== null) {
                    this.maxByFamily.set(family, familyMax);
                }
            });
            this.globalSeriesMax = Number.isFinite(globalMax) ? globalMax : null;
        }

        updateInfoPanel() {
            const rows = this.buildCityRows(this.selectedYear);
            const handleRowClick = d => {
                if (d.isAverage) {
                    this.selectedCity = null;
                } else if (this.selectedCity === d.city) {
                    this.selectedCity = null;
                } else {
                    this.selectedCity = d.city;
                }
                this.update();
            };
            const infoInnerWidth = this.infoWidth - 16;
            const infoHeight = this.chartHeight - 24;
            const barMax = 100; // represent up to 100% of income
            const rowWidth = infoInnerWidth;
            const yScale = d3.scaleBand()
                .domain(rows.map(d => d.city))
                .range([0, infoHeight])
                .paddingInner(0.25);
            const xScale = d3.scaleLinear()
                .domain([0, barMax])
                .range([0, infoInnerWidth - 60]);

            this.infoTitle.text(`% of Income Spent on Rent by City (${this.selectedYear})`);

            const rowSel = this.infoRows.selectAll('.info-row').data(rows, d => d.city);
            const rowEnter = rowSel.enter().append('g').attr('class', 'info-row');
            rowEnter.append('rect')
                .attr('class', 'info-row-bg')
                .attr('x', -4)
                .attr('y', -6)
                .attr('fill', 'transparent');
            rowEnter.append('text')
                .attr('class', 'info-city')
                .attr('x', 0)
                .attr('y', -2)
                .attr('font-weight', 600)
                .attr('font-size', 14)
                .attr('fill', '#111827');
            rowEnter.append('rect')
                .attr('class', 'info-bar-bg')
                .attr('x', 0)
                .attr('y', 10)
                .attr('height', 18)
                .attr('fill', '#e5e7eb')
                .attr('rx', 6);
            rowEnter.append('rect')
                .attr('class', 'info-bar-fill')
                .attr('x', 0)
                .attr('y', 10)
                .attr('height', 18)
                .attr('fill', RENT_COLOR)
                .attr('rx', 6);
            rowEnter.append('text')
                .attr('class', 'info-share')
                .attr('y', 24)
                .attr('font-size', 13)
                .attr('fill', '#111827');
            rowEnter.append('text')
                .attr('class', 'info-values')
                .attr('y', 40)
                .attr('font-size', 12)
                .attr('fill', '#6b7280');
            rowEnter.append('line')
                .attr('class', 'info-divider')
                .attr('x1', 0)
                .attr('x2', rowWidth)
                .attr('y1', 46)
                .attr('y2', 46)
                .attr('stroke', '#e5e7eb')
                .attr('stroke-width', 1);

            const merged = rowEnter.merge(rowSel);
            const move = d3.transition().duration(450).ease(d3.easeCubicOut);
            merged.transition(move)
                .attr('transform', d => `translate(0, ${yScale(d.city) || 0})`);
            merged.style('cursor', 'pointer')
                .on('click', (_, d) => handleRowClick(d));
            merged.classed('is-selected', d => Boolean(d.isSelected));

            merged.select('.info-row-bg')
                .attr('width', rowWidth + 8)
                .attr('height', yScale.bandwidth() + 16)
                .attr('fill', d => {
                    if (d.isAverage) return '#fff38859';
                    if (d.isSelected) return '#dbeafe';
                    return '#e5e7eb1e';
                })
                .attr('y', -22)
                .attr('stroke', 'none');
            merged.select('.info-city').text(d => d.province ? `${d.cityLabel}, ${d.province}` : d.cityLabel);
            merged.select('.info-bar-bg')
                .attr('width', xScale(barMax));
            merged.select('.info-bar-fill')
                .transition(move)
                .attr('width', d => Number.isFinite(d.share) ? xScale(Math.min(d.share, barMax)) : 0);
            merged.select('.info-share')
                .text(d => d.shareText || (Number.isFinite(d.share) ? formatPercent(d.share) : 'No data'))
                .transition(move)
                .attr('x', d => Number.isFinite(d.share) ? xScale(Math.min(d.share, barMax)) + 6 : 6);
            merged.select('.info-values')
                .text(d => {
                    const rentText = Number.isFinite(d.rent) ? `Rent: ${formatMoney(d.rent)}` : 'Rent: no data';
                    const incomeText = Number.isFinite(d.income) ? `Income: ${formatMoney(d.income)}` : 'Income: no data';
                    return `${rentText} | ${incomeText}`;
                });
            merged.select('.info-divider')
                .attr('x2', rowWidth)
                .attr('y1', yScale.bandwidth() - 6)
                .attr('y2', yScale.bandwidth() - 6)
                .style('display', (_, i) => i === rows.length - 1 ? 'none' : null);

            rowSel.exit().remove();
        }

        setYear(year) {
            const numericYear = Number(year);
            if (!Number.isFinite(numericYear)) return;
            this.selectedYear = numericYear;
            this.update();
        }

        setFamilyType(family) {
            this.selectedFamily = family;
            this.update();
        }

        nearestYear(value) {
            if (!Array.isArray(this.availableYears) || !this.availableYears.length) return null;
            let best = this.availableYears[0];
            let bestDiff = Math.abs(value - best);
            this.availableYears.forEach(year => {
                const diff = Math.abs(value - year);
                if (diff < bestDiff) {
                    best = year;
                    bestDiff = diff;
                }
            });
            return best;
        }

        handleChartClick(event) {
            if (!this.xScale) return;
            const [mx] = d3.pointer(event, this.chartGroup.node());
            if (!Number.isFinite(mx)) return;
            const rawYear = this.xScale.invert(mx);
            const nearest = this.nearestYear(rawYear);
            if (Number.isFinite(nearest)) {
                this.setYear(nearest);
                if (incomeRentControlsV2 && typeof incomeRentControlsV2.setYear === 'function') {
                    incomeRentControlsV2.setYear(nearest);
                }
            }
        }

        handleHover(event) {
            if (!this.xScale || !this.hoverMarker) return;
            const [mx] = d3.pointer(event, this.chartGroup.node());
            if (!Number.isFinite(mx)) {
                this.hideHover();
                return;
            }
            const rawYear = this.xScale.invert(mx);
            const nearest = this.nearestYear(rawYear);
            if (!Number.isFinite(nearest)) {
                this.hideHover();
                return;
            }
            const xPos = this.xScale(nearest);
            this.hoverMarker
                .attr('x1', xPos)
                .attr('x2', xPos)
                .style('opacity', 1);
        }

        hideHover() {
            if (this.hoverMarker) {
                this.hoverMarker.style('opacity', 0);
            }
        }
    }

    function renderVis4v2Controls(containerSelector, years, familyTypes, initialYear, initialFamily, onYearChange, onFamilyChange) {
    const root = d3.select(containerSelector);
    root.selectAll('*').remove();

        const controls = root.append('div')
            .attr('class', 'vis4v2-control-bar')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('justify-content', 'center')
            .style('flex-wrap', 'wrap')
            .style('gap', '10px')
            .style('margin', '6px 0');

    const makeCard = () => controls.append('div')
        .style('display', 'flex')
        .style('align-items', 'center')
        .style('gap', '8px')
        .style('padding', '8px 10px')
        .style('border', '1px solid #d1d5db')
        .style('border-radius', '10px')
        .style('background', '#ffffff');

        // Year controls
        const yearCard = makeCard();
        // Play/pause + reset
        let playTimer = null;
        let playing = false;
        let currentYear = initialYear;
        const stopPlayback = () => {
            if (playTimer) {
                clearInterval(playTimer);
                playTimer = null;
            }
            playing = false;
            playBtn.text('▶ Play');
        };
        const stepPlayback = () => {
            if (!years.length) {
                stopPlayback();
                return;
            }
            const idx = years.indexOf(currentYear);
            const nextIdx = idx === -1 ? 0 : (idx + 1) % years.length;
            const nextYear = years[nextIdx];
            currentYear = nextYear;
            yearSlider.property('value', nextYear);
            yearDisplay.text(nextYear);
            onYearChange(nextYear);
        };
        const buttonBase = sel => sel
            .style('display', 'inline-flex')
            .style('align-items', 'center')
            .style('gap', '4px')
            .style('padding', '6px 10px')
            .style('border', '1px solid #d1d5db')
            .style('border-radius', '8px')
            .style('background', '#f4f4f5')
            .style('color', '#1f2937')
            .style('font-weight', '600')
            .style('min-height', '32px')
            .style('min-width', '90px')
            .style('white-space', 'nowrap')
            .style('cursor', 'pointer');
        const playBtn = buttonBase(yearCard.append('button')
            .attr('type', 'button')
            .text('▶ Play')
            .on('click', () => {
                if (playing) {
                    stopPlayback();
                } else {
                    playing = true;
                    playBtn.text('❚❚ Pause');
                    playTimer = setInterval(stepPlayback, 1000);
                }
            }));
        buttonBase(yearCard.append('button')
            .attr('type', 'button')
            .text('↺ Reset')
            .on('click', () => {
                stopPlayback();
                const minYear = years[0] || initialYear;
                currentYear = minYear;
                yearSlider.property('value', minYear);
                yearDisplay.text(minYear);
                onYearChange(minYear);
            }));
        // Year label and slider
        yearCard.append('span')
            .style('font-weight', '600')
            .style('color', '#4b5563')
            .text('Year:');
        const yearDisplay = yearCard.append('span')
            .attr('id', 'vis4v2-year-display')
            .style('font-weight', '700')
            .style('color', '#111827')
            .text(initialYear);
        yearCard.append('span')
            .style('color', '#9ca3af')
            .style('font-size', '0.85rem')
            .text(years[0] || '');
        const yearSlider = yearCard.append('input')
            .attr('type', 'range')
            .attr('min', years[0] || 2000)
            .attr('max', years[years.length - 1] || 2023)
            .attr('step', 1)
            .attr('value', initialYear)
            .style('min-width', '180px')
            .style('margin', '0 4px')
            .style('align-self', 'center')
            .on('input', event => {
                const value = Number(event.target.value);
                if (!Number.isFinite(value)) return;
                yearDisplay.text(value);
                onYearChange(value);
                currentYear = value;
                stopPlayback();
            });
        yearCard.append('span')
            .style('color', '#9ca3af')
            .style('font-size', '0.85rem')
            .text(years[years.length - 1] || '');

        // Family controls
        const familyCard = makeCard();
        familyCard.append('span')
            .style('font-weight', '600')
            .style('color', '#4b5563')
            .text('Family type:');
        const familyOrder = ['Single individuals', 'Single-parent families', 'Dual-parent families'];
        const familyButtons = familyCard.append('div')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('gap', '8px')
            .style('flex-wrap', 'nowrap')
            .selectAll('button')
            .data(familyOrder)
            .enter()
            .append('button')
            .attr('type', 'button')
            .style('padding', '6px 10px')
            .style('border', '1px solid #d1d5db')
            .style('border-radius', '8px')
            .style('background', d => d === initialFamily ? '#e0f2fe' : '#f4f4f5')
            .style('color', '#1f2937')
            .style('font-weight', '600')
            .style('min-height', '32px')
            .style('display', 'inline-flex')
            .style('align-items', 'center')
            .style('gap', '4px')
            .style('white-space', 'nowrap')
            .style('cursor', 'pointer')
            .text(d => d)
            .on('click', (_, d) => {
                familyButtons
                    .style('background', btn => btn === d ? '#e0f2fe' : '#f4f4f5')
                    .style('border-color', btn => btn === d ? '#60a5fa' : '#d1d5db');
                onFamilyChange(d);
            });

        return {
            setYear: year => {
                const value = Number(year);
                if (!Number.isFinite(value)) return;
                yearSlider.property('value', value);
                yearDisplay.text(value);
                currentYear = value;
                stopPlayback();
            }
        };
    }

let incomeRentVisV2Instance = null;
let incomeRentControlsV2 = null;
let precomputedIncomeRentData = null;

    window.initIncomeVisV2 = function () {
        const startVis = () => {
            const defaultFamily = 'Single individuals';
            incomeRentVisV2Instance = new IncomeRentV2({
                parentElement: '#vis4v2-container',
                precomputedData: precomputedIncomeRentData
            });
            incomeRentVisV2Instance.selectedFamily = defaultFamily;
            incomeRentVisV2Instance.init();

            const familyTypes = incomeRentVisV2Instance.familyTypes;
            const initialFamily = defaultFamily;
            const years = incomeRentVisV2Instance.availableYears;
            const initialYear = incomeRentVisV2Instance.selectedYear || (years.length ? years[years.length - 1] : 2000);

        incomeRentControlsV2 = renderVis4v2Controls(
            '#vis4v2-controls',
            years,
            familyTypes,
            initialYear,
            initialFamily,
            year => incomeRentVisV2Instance.setYear(year),
            family => incomeRentVisV2Instance.setFamilyType(family)
        );
    };

    if (precomputedIncomeRentData) {
        startVis();
    } else {
        d3.json('data/jeff/income_rent_precomputed.json').then(json => {
            precomputedIncomeRentData = json;
            startVis();
        }).catch(() => {
            startVis();
        });
    }
};

window.destructIncomeVisV2 = function () {
    d3.select('#vis4v2-container').selectAll('*').remove();
    d3.select('#vis4v2-controls').selectAll('*').remove();
    incomeRentControlsV2 = null;
    incomeRentVisV2Instance = null;
};
})();
