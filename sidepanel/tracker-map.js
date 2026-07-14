// TrackerRay Force Directed Graph Visualization

window.TrackerMap = (function () {
  let svg, simulation;
  let linkGroup, nodeGroup, labelGroup;
  let onNodeClickCallback = null;

  // Visual constants matching styles.css
  const colors = {
    'first-party': '#00d2ff',
    'ads': '#f43f5e',
    'analytics': '#10b981',
    'social': '#a855f7',
    'utility': '#f59e0b',
    'blocked': '#ef4444'
  };

  function init(containerSelector, onNodeClick) {
    onNodeClickCallback = onNodeClick;
    const container = document.querySelector(containerSelector);
    if (!container) return;

    // Clear previous SVG
    container.innerHTML = '';

    const width = container.clientWidth || 320;
    const height = container.clientHeight || 250;

    // Create SVG element
    const rawSvg = d3.select(containerSelector)
      .append("svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .call(d3.zoom().scaleExtent([0.5, 3]).on("zoom", (event) => {
        svg.attr("transform", event.transform);
      }));

    svg = rawSvg.append("g");

    // Initialize D3 Force Simulation
    simulation = d3.forceSimulation()
      .force("link", d3.forceLink().id(d => d.id).distance(60))
      .force("charge", d3.forceManyBody().strength(-150))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(d => d.category === 'first-party' ? 22 : 16));

    linkGroup = svg.append("g").attr("class", "links-group");
    nodeGroup = svg.append("g").attr("class", "nodes-group");
    labelGroup = svg.append("g").attr("class", "labels-group");
  }

  function update(nodesData, linksData) {
    if (!simulation) return;

    // Clone data to avoid mutating background reference arrays
    const nodes = nodesData.map(d => ({ ...d }));
    const links = linksData.map(d => ({ ...d }));

    // 1. Update Links
    const link = linkGroup.selectAll("line")
      .data(links, d => `${d.source}-${d.target}`);

    link.exit().remove();

    const linkEnter = link.enter().append("line")
      .attr("class", "link")
      .attr("stroke", d => {
        // If target node is blocked, show glowing red link
        const targetNode = nodes.find(n => n.id === d.target);
        return (targetNode && targetNode.blocked) ? 'rgba(239, 68, 68, 0.4)' : 'rgba(255, 255, 255, 0.15)';
      })
      .attr("stroke-width", 1.5);

    const combinedLinks = linkEnter.merge(link);

    // 2. Update Nodes
    const node = nodeGroup.selectAll("circle")
      .data(nodes, d => d.id);

    node.exit().remove();

    const nodeEnter = node.enter().append("circle")
      .attr("class", "node")
      .call(drag(simulation));

    // Update existing + new node attributes
    const combinedNodes = nodeEnter.merge(node)
      .attr("r", d => d.category === 'first-party' ? 14 : 9)
      .attr("fill", d => d.blocked ? 'rgba(239, 68, 68, 0.15)' : (colors[d.category] || '#9ca3af'))
      .attr("stroke", d => d.blocked ? colors['blocked'] : 'rgba(255,255,255,0.2)')
      .attr("stroke-width", d => d.blocked ? 2.5 : 1)
      .style("filter", d => d.blocked ? 'drop-shadow(0 0 5px #ef4444)' : 'none')
      .on("click", (event, d) => {
        if (onNodeClickCallback && d.category !== 'first-party') {
          onNodeClickCallback(d.id, d.blocked);
        }
      });

    // 3. Update Text Labels (Only display top nodes or first-party to reduce noise)
    const label = labelGroup.selectAll("text")
      .data(nodes, d => d.id);

    label.exit().remove();

    const labelEnter = label.enter().append("text")
      .attr("class", "node-label")
      .attr("text-anchor", "middle")
      .attr("dy", d => d.category === 'first-party' ? 24 : 16);

    const combinedLabels = labelEnter.merge(label)
      .text(d => {
        // Shorten long domain names
        if (d.category === 'first-party') return d.id;
        return d.id.length > 15 ? d.id.substring(0, 12) + '...' : d.id;
      })
      .attr("fill", d => d.category === 'first-party' ? '#ffffff' : '#9ca3af');

    // Update simulation
    simulation.nodes(nodes).on("tick", () => {
      combinedLinks
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      combinedNodes
        .attr("cx", d => d.x)
        .attr("cy", d => d.y);

      combinedLabels
        .attr("x", d => d.x)
        .attr("y", d => d.y);
    });

    simulation.force("link").links(links);
    simulation.alpha(0.6).restart();
  }

  // D3 Drag gestures
  function drag(sim) {
    return d3.drag()
      .on("start", (event, d) => {
        if (!event.active) sim.alphaTarget(0.2).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) sim.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
  }

  return {
    init,
    update
  };
})();
