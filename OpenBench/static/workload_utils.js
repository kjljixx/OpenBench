function copy_text(text) {

  var area = document.createElement("textarea");
  area.value = text;
  document.body.append(area);
  area.select();

  try {
    document.execCommand("copy");
    document.body.removeChild(area);
  }

  catch (err) {
    document.body.removeChild(area);
    console.error("Unable to copy to Clipboard");
  }
}

function copy_text_from_element(element_id, keep_url) {

  var text = document.getElementById(element_id).innerHTML;
  text = text.replace(/<br>/g, "\n");

  if (keep_url)
    text += "\n" + window.location.href;

  copy_text(text);
}

const SPSA_GRAPH_COLORS = [
  '#49dcb1', '#6eb8ff', '#ffb86c', '#ff6b88', '#c792ea',
  '#87e663', '#ffd166', '#4dd0e1', '#f4a261', '#ef476f',
  '#9ad0f5', '#f7a1c4', '#74f5c5', '#f3e97a', '#b6a3ff', '#8bd6a5',
]

window.spsaGraphState = null

function ensure_spsa_graph_state(history) {

  if (!window.spsaGraphState || window.spsaGraphState.history !== history) {
    const allNames = history.series.map(series => series.name)
    window.spsaGraphState = {
      history,
      selected: new Set(allNames),
    }
  }

  return window.spsaGraphState
}

function spsa_series_color(index) {
  return SPSA_GRAPH_COLORS[index % SPSA_GRAPH_COLORS.length]
}

function format_axis_tick(value) {

  const absValue = Math.abs(value)
  if (absValue >= 1000)
    return (value / 1000).toFixed(1).replace(/\.0$/, '') + 'k'

  if (absValue >= 10)
    return value.toFixed(1).replace(/\.0$/, '')

  return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

function update_spsa_selection_summary() {

  const summary = document.getElementById('spsa-history-selected-count')
  if (!summary || !window.spsaGraphState)
    return

  const total = window.spsaGraphState.history.series.length
  const selected = window.spsaGraphState.selected.size
  summary.textContent = `${selected}/${total} selected`
}

function build_spsa_series_controls(history) {

  const container = document.getElementById('spsa-series-controls')
  const state = ensure_spsa_graph_state(history)
  if (!container)
    return

  container.innerHTML = ''

  history.series.forEach((series, index) => {
    const label = document.createElement('label')
    label.style.display = 'inline-flex'
    label.style.alignItems = 'center'
    label.style.gap = '6px'
    label.style.marginRight = '12px'
    label.style.marginBottom = '6px'
    label.style.userSelect = 'none'

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = state.selected.has(series.name)
    checkbox.addEventListener('change', function () {
      if (checkbox.checked) state.selected.add(series.name)
      else state.selected.delete(series.name)
      update_spsa_selection_summary()
      draw_spsa_history_graph(history)
    })

    const swatch = document.createElement('span')
    swatch.style.display = 'inline-block'
    swatch.style.width = '10px'
    swatch.style.height = '10px'
    swatch.style.backgroundColor = spsa_series_color(index)
    swatch.style.borderRadius = '2px'

    const text = document.createElement('span')
    text.textContent = series.name
    text.style.color = 'var(--color-font1)'
    text.style.fontSize = '13px'

    label.appendChild(checkbox)
    label.appendChild(swatch)
    label.appendChild(text)

    container.appendChild(label)
  })

  update_spsa_selection_summary()
}

function select_all_spsa_series(selected) {

  if (!window.spsaGraphState)
    return

  const allNames = window.spsaGraphState.history.series.map(series => series.name)
  window.spsaGraphState.selected = selected ? new Set(allNames) : new Set()

  build_spsa_series_controls(window.spsaGraphState.history)
  draw_spsa_history_graph(window.spsaGraphState.history)
}

function initialize_spsa_history_graph(history) {

  if (!history || !history.series || history.series.length === 0)
    return

  ensure_spsa_graph_state(history)
  build_spsa_series_controls(history)
  draw_spsa_history_graph(history)
}

function draw_spsa_history_graph(history) {

  const canvas = document.getElementById('spsa-history-graph')
  if (!canvas || !history || !history.series || history.series.length === 0)
    return

  const state = ensure_spsa_graph_state(history)
  const activeSeries = history.series.filter(series => state.selected.has(series.name))

  const rect = canvas.getBoundingClientRect()
  const width = Math.max(300, Math.floor(rect.width || 900))
  const height = Math.max(220, Math.floor(rect.height || 320))

  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.floor(width * dpr)
  canvas.height = Math.floor(height * dpr)

  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)

  const margin = { left: 64, right: 20, top: 12, bottom: 40 }
  const plotW = width - margin.left - margin.right
  const plotH = height - margin.top - margin.bottom

  let observedXMax = 0
  let yMin = Number.POSITIVE_INFINITY
  let yMax = Number.NEGATIVE_INFINITY

  const xSeries = activeSeries.length ? activeSeries : history.series

  xSeries.forEach(series => {
    series.points.forEach(point => {
      observedXMax = Math.max(observedXMax, Number(point.x))
    })
  })

  activeSeries.forEach(series => {
    series.points.forEach(point => {
      yMin = Math.min(yMin, Number(point.y))
      yMax = Math.max(yMax, Number(point.y))
    })
  })

  const xPad = Math.max(1, observedXMax * 0.03)
  const xMax = Math.max(1, observedXMax + xPad)
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    yMin = 0
    yMax = 1
  }

  if (yMin === yMax) {
    yMin -= 1
    yMax += 1
  }

  const yPad = (yMax - yMin) * 0.08
  yMin -= yPad
  yMax += yPad

  const xToPx = x => margin.left + (Number(x) / xMax) * plotW
  const yToPx = y => margin.top + (1 - ((Number(y) - yMin) / (yMax - yMin))) * plotH

  // Background and border
  ctx.fillStyle = '#10131a'
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = '#3a4252'
  ctx.strokeRect(margin.left, margin.top, plotW, plotH)

  // Grid lines
  ctx.strokeStyle = '#242a36'
  ctx.lineWidth = 1
  const yTickCount = 4
  for (let i = 0; i <= yTickCount; i++) {
    const y = margin.top + i * (plotH / yTickCount)
    ctx.beginPath()
    ctx.moveTo(margin.left, y)
    ctx.lineTo(margin.left + plotW, y)
    ctx.stroke()

    const yValue = yMax - ((yMax - yMin) * i / yTickCount)
    ctx.fillStyle = '#c9d3e2'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(format_axis_tick(yValue), margin.left - 8, y)
  }

  const xTickCount = 6
  for (let i = 0; i <= xTickCount; i++) {
    const x = margin.left + i * (plotW / xTickCount)
    ctx.beginPath()
    ctx.moveTo(x, margin.top)
    ctx.lineTo(x, margin.top + plotH)
    ctx.stroke()

    const xValue = xMax * i / xTickCount
    ctx.fillStyle = '#c9d3e2'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(format_axis_tick(xValue), x, margin.top + plotH + 6)
  }

  activeSeries.forEach((series, index) => {
    const points = series.points || []
    if (!points.length)
      return

    const seriesIndex = history.series.findIndex(item => item.name === series.name)
    const color = spsa_series_color(seriesIndex >= 0 ? seriesIndex : index)
    ctx.strokeStyle = color
    ctx.lineWidth = 1.8

    ctx.beginPath()
    points.forEach((point, i) => {
      const px = xToPx(point.x)
      const py = yToPx(point.y)
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.stroke()
  })

  // Axis labels
  ctx.fillStyle = '#c9d3e2'
  ctx.font = '12px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('Iteration', margin.left + (plotW / 2), margin.top + plotH + 22)

  if (!activeSeries.length) {
    ctx.fillStyle = '#c9d3e2'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('Select one or more parameters above to display lines.', margin.left + (plotW / 2), margin.top + (plotH / 2))
  }
}

function populate_results(results) {

  const container = document.getElementById('results-container');

  container.innerHTML = ''; // Clear everything for sanity

  var options = {
    year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit',
    minute: '2-digit', second: '2-digit',
    hour12: false,
  };

  const formatter = new Intl.DateTimeFormat('en-US', options);

  results.forEach(result => {
    const tr = document.createElement('tr');

    // Highlight active rows
    if (result.active) tr.classList.add('active-highlight');

    const ts = Number(result.updated)
    const date = new Date(ts * 1000);
    const formatted = formatter.format(date);

    tr.innerHTML = `
            <td><a href="/machines/${result.machine__id}">${result.machine__id}</a></td>
            <td>${result.machine__user__username.charAt(0).toUpperCase() + result.machine__user__username.slice(1)}</td>
            <td class="">${formatted}</td>
            <td class="numeric">${result.games}</td>
            <td class="numeric">${result.wins}</td>
            <td class="numeric">${result.losses}</td>
            <td class="numeric">${result.draws}</td>
            <td class="numeric">${result.timeloss}</td>
            <td class="numeric">${result.crashes}</td>
        `;

    container.appendChild(tr);
  });
}

async function fetch_results(workload_id) {
  fetch(`/api/workload/${workload_id}/results/`)
    .then(r => r.json())
    .then(data => populate_results(data.results))
}

async function copy_spsa_inputs(workload_id) {
  const resp = await fetch(`/api/spsa/${workload_id}/inputs/`)
  const text = await resp.text()
  copy_text(text)
}

async function copy_spsa_outputs(workload_id) {
  const resp = await fetch(`/api/spsa/${workload_id}/outputs_ob/`)
  const text = await resp.text()
  copy_text(text)
}

async function fetch_spsa_digest(workload_id) {
  const resp = await fetch(`/api/spsa/${workload_id}/digest/`)
  const text = await resp.text()
  const lines = text.trim().split('\n')

  // Skip the header line (index 0) and process data rows
  const tbody = document.getElementById('spsa-digest-body-container')
  tbody.innerHTML = ''

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',')
    const tr = document.createElement('tr')

    values.forEach(value => {
      const td = document.createElement('td')
      td.textContent = value
      tr.appendChild(td)
    })

    tbody.appendChild(tr)
  }

  // Show the data and hide the button
  tbody.style.display = ''
  const buttonContainer = document.getElementById('spsa-digest-button-container')
  buttonContainer.style.display = 'none'
}

document.addEventListener('DOMContentLoaded', function () {
  if (window.spsaHistory)
    initialize_spsa_history_graph(window.spsaHistory)
})

window.addEventListener('resize', function () {
  if (window.spsaHistory)
    draw_spsa_history_graph(window.spsaHistory)
})
