/**
 * Equation of State Calculator
 * Based on Sandler's Thermodynamics
 */

const R = 0.08314; // L*bar/(mol*K)

// Predefined substances properties
const substances = {
    water: { tc: 647.1, pc: 220.55, omega: 0.345 },
    co2: { tc: 304.2, pc: 73.83, omega: 0.224 },
    methane: { tc: 190.6, pc: 45.99, omega: 0.012 },
    nitrogen: { tc: 126.2, pc: 34.00, omega: 0.038 },
    ethane: { tc: 305.3, pc: 48.72, omega: 0.100 },
    propane: { tc: 369.8, pc: 42.48, omega: 0.152 },
    ammonia: { tc: 405.7, pc: 113.5, omega: 0.253 },
    oxygen: { tc: 154.6, pc: 50.43, omega: 0.022 }
};

// Math utility to solve cubic equation: Z^3 + C2*Z^2 + C1*Z + C0 = 0
function solveCubic(C2, C1, C0) {
    const p = C1 - Math.pow(C2, 2) / 3;
    const q = (2 * Math.pow(C2, 3)) / 27 - (C1 * C2) / 3 + C0;
    
    // Discriminant calculated based purely on c2, c1, c0
    const discriminant = Math.pow(q, 2) / 4 + Math.pow(p, 3) / 27;
    
    let roots = [];
    const EPSILON = 1e-5;
    
    if (discriminant > EPSILON) {
        // One real root
        const u = Math.cbrt(-q / 2 + Math.sqrt(discriminant));
        const v = Math.cbrt(-q / 2 - Math.sqrt(discriminant));
        const x = u + v;
        roots.push(x - C2 / 3);
    } else if (Math.abs(discriminant) <= EPSILON) {
        // Three real roots, at least two are equal
        const u = Math.cbrt(-q / 2);
        roots.push(2 * u - C2 / 3);
        roots.push(-u - C2 / 3);
    } else {
        // Three distinct real roots
        const r = Math.sqrt(-Math.pow(p, 3) / 27);
        const theta = Math.acos(-q / (2 * r));
        
        const r_cbrt = Math.cbrt(r);
        const x1 = 2 * r_cbrt * Math.cos(theta / 3);
        const x2 = 2 * r_cbrt * Math.cos((theta + 2 * Math.PI) / 3);
        const x3 = 2 * r_cbrt * Math.cos((theta + 4 * Math.PI) / 3);
        
        roots.push(x1 - C2 / 3, x2 - C2 / 3, x3 - C2 / 3);
    }
    
    // Filter to valid physical roots (Z > 0) and sort ascending
    roots = roots.filter(z => z > 0).sort((a, b) => a - b);
    
    // De-duplicate roots very close to each other
    const uniqueRoots = [];
    for (let root of roots) {
        if (uniqueRoots.length === 0 || Math.abs(uniqueRoots[uniqueRoots.length - 1] - root) > 1e-5) {
            uniqueRoots.push(root);
        }
    }
    
    // If we have multiple distinct real roots, we are in two-phase region. 
    // Smallest is liquid, largest is vapor. Middle root (if any) is physically meaningless.
    if (uniqueRoots.length >= 2) {
        return [uniqueRoots[0], uniqueRoots[uniqueRoots.length - 1]]; // [liquid, vapor]
    }
    
    return uniqueRoots; // Returns 1 root
}

// Equation of State Models
const EOS = {
    Ideal: (T, P, tc, pc, omega) => {
        return [1.0];
    },
    VdW: (T, P, tc, pc, omega) => {
        const Tr = T / tc;
        const Pr = P / pc;
        const A = (27 / 64) * (Pr / Math.pow(Tr, 2));
        const B = (1 / 8) * (Pr / Tr);
        
        const C2 = -(1 + B);
        const C1 = A;
        const C0 = -A * B;
        
        return solveCubic(C2, C1, C0);
    },
    RK: (T, P, tc, pc, omega) => {
        const Tr = T / tc;
        const Pr = P / pc;
        const A = 0.42748 * (Pr / Math.pow(Tr, 2.5));
        const B = 0.08664 * (Pr / Tr);
        
        const C2 = -1;
        const C1 = A - B - Math.pow(B, 2);
        const C0 = -A * B;
        
        return solveCubic(C2, C1, C0);
    },
    SRK: (T, P, tc, pc, omega) => {
        const Tr = T / tc;
        const Pr = P / pc;
        const alpha = Math.pow(1 + (0.480 + 1.574 * omega - 0.176 * Math.pow(omega, 2)) * (1 - Math.sqrt(Tr)), 2);
        const A = 0.42748 * (Pr / Math.pow(Tr, 2)) * alpha;
        const B = 0.08664 * (Pr / Tr);
        
        const C2 = -1;
        const C1 = A - B - Math.pow(B, 2);
        const C0 = -A * B;
        
        return solveCubic(C2, C1, C0);
    },
    PR: (T, P, tc, pc, omega) => {
        const Tr = T / tc;
        const Pr = P / pc;
        const alpha = Math.pow(1 + (0.37464 + 1.54226 * omega - 0.26992 * Math.pow(omega, 2)) * (1 - Math.sqrt(Tr)), 2);
        const A = 0.45724 * (Pr / Math.pow(Tr, 2)) * alpha;
        const B = 0.07780 * (Pr / Tr);
        
        const C2 = -(1 - B);
        const C1 = A - 2 * B - 3 * Math.pow(B, 2);
        const C0 = -(A * B - Math.pow(B, 2) - Math.pow(B, 3));
        
        return solveCubic(C2, C1, C0);
    }
};

let chartInstance = null;

// DOM Elements
const form = document.getElementById('calc-form');
const substanceSelect = document.getElementById('substance');
const customProps = document.getElementById('custom-props');
const trDisplay = document.getElementById('tr-display');
const prDisplay = document.getElementById('pr-display');
const validationWarning = document.getElementById('validation-warning');
const tableBody = document.querySelector('#results-table tbody');
const ctx = document.getElementById('zChart').getContext('2d');

// Toggle Custom Properties visibility
substanceSelect.addEventListener('change', (e) => {
    if (e.target.value === 'custom') {
        customProps.classList.remove('hidden');
        document.getElementById('tc').required = true;
        document.getElementById('pc').required = true;
        document.getElementById('omega').required = true;
    } else {
        customProps.classList.add('hidden');
        document.getElementById('tc').required = false;
        document.getElementById('pc').required = false;
        document.getElementById('omega').required = false;
    }
});

// Format numbers nicely
function formatNumber(num) {
    if (Math.abs(num) < 0.01 || Math.abs(num) >= 10000) {
        return num.toExponential(4);
    }
    return num.toPrecision(4);
}

// Convert input units to standard (K, bar)
function getStandardizedInputs() {
    let T = parseFloat(document.getElementById('temp').value);
    const tempUnit = document.getElementById('temp-unit').value;
    if (tempUnit === 'C') T += 273.15;
    
    let P = parseFloat(document.getElementById('press').value);
    const pressUnit = document.getElementById('press-unit').value;
    if (pressUnit === 'atm') P = P * 1.01325;
    else if (pressUnit === 'Pa') P = P / 100000;
    
    return { T, P };
}

function renderChart(data) {
    const labels = data.map(d => d.name);
    
    // Separate into single roots and multi roots for clear chart presentation
    const dataVaporOrSingle = data.map(d => {
        if (d.roots.length === 1) return d.roots[0];
        return d.roots[1]; // largest root is vapor
    });
    
    const dataLiquid = data.map(d => {
        if (d.roots.length === 1) return null;
        return d.roots[0]; // smallest root is liquid
    });

    const datasets = [
        {
            label: 'Z (Vapor / Single Phase)',
            data: dataVaporOrSingle,
            backgroundColor: 'rgba(20, 184, 166, 0.8)', // teal
            borderColor: 'rgba(20, 184, 166, 1)',
            borderWidth: 1
        }
    ];

    if (dataLiquid.some(val => val !== null)) {
        datasets.push({
            label: 'Z (Liquid)',
            data: dataLiquid,
            backgroundColor: 'rgba(245, 158, 11, 0.8)', // amber
            borderColor: 'rgba(245, 158, 11, 1)',
            borderWidth: 1
        });
    }

    if (chartInstance) {
        chartInstance.destroy();
    }

    // Chart.js global defaults for dark mode
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = '#334155';
    Chart.defaults.font.family = "'Inter', sans-serif";

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#f8fafc',
                        font: {
                            size: window.innerWidth < 480 ? 10 : 12
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + formatNumber(context.raw);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Compressibility Factor (Z)',
                        color: '#f8fafc',
                        font: {
                            size: window.innerWidth < 480 ? 10 : 12
                        }
                    },
                    ticks: {
                        font: {
                            size: window.innerWidth < 480 ? 10 : 12
                        }
                    }
                },
                x: {
                    ticks: {
                        font: {
                            size: window.innerWidth < 480 ? 9 : 12
                        }
                    }
                }
            }
        }
    });
}

// Handle Form Submission
form.addEventListener('submit', (e) => {
    e.preventDefault();
    
    validationWarning.classList.add('hidden');
    
    // Get Properties
    const substanceKey = substanceSelect.value;
    let tc, pc, omega;
    
    if (substanceKey === 'custom') {
        tc = parseFloat(document.getElementById('tc').value);
        pc = parseFloat(document.getElementById('pc').value);
        omega = parseFloat(document.getElementById('omega').value);
    } else {
        const props = substances[substanceKey];
        tc = props.tc;
        pc = props.pc;
        omega = props.omega;
    }
    
    const { T, P } = getStandardizedInputs();
    
    if (T <= 0) {
        validationWarning.textContent = "Temperature must be greater than 0 K.";
        validationWarning.classList.remove('hidden');
        return;
    }
    
    const Tr = T / tc;
    const Pr = P / pc;
    
    trDisplay.textContent = formatNumber(Tr);
    prDisplay.textContent = formatNumber(Pr);
    
    if (Tr < 0.3 || Tr > 5 || Pr > 50) {
        validationWarning.innerHTML = `<strong>Warning:</strong> Reduced properties ($T_r=${formatNumber(Tr)}, P_r=${formatNumber(Pr)}$) may be outside typical reliability range for cubic equations.`;
        validationWarning.classList.remove('hidden');
    }
    
    // Calculate for each EOS
    const results = [];
    tableBody.innerHTML = '';
    
    for (const [name, func] of Object.entries(EOS)) {
        const roots = func(T, P, tc, pc, omega);
        results.push({ name, roots });
        
        const tr = document.createElement('tr');
        
        let zHtml = '';
        let vHtml = '';
        let devHtml = '';
        
        if (roots.length === 1) {
            const z = roots[0];
            const v = (z * R * T) / P; // L/mol
            zHtml = formatNumber(z);
            vHtml = `${formatNumber(v)}`;
            devHtml = `${formatNumber(((z - 1) / 1) * 100)}%`;
        } else if (roots.length === 2) {
            // Liquid and Vapor roots
            const zL = roots[0];
            const zV = roots[1];
            const vL = (zL * R * T) / P;
            const vV = (zV * R * T) / P;
            
            zHtml = `
                <div class="multi-root">
                    <span><span class="root-label root-v">Vap</span> ${formatNumber(zV)}</span>
                    <span><span class="root-label root-l">Liq</span> ${formatNumber(zL)}</span>
                </div>`;
            vHtml = `
                <div class="multi-root">
                    <span>${formatNumber(vV)}</span>
                    <span>${formatNumber(vL)}</span>
                </div>`;
            devHtml = `
                <div class="multi-root">
                    <span>${formatNumber(((zV - 1) / 1) * 100)}%</span>
                    <span>${formatNumber(((zL - 1) / 1) * 100)}%</span>
                </div>`;
        } else {
            zHtml = 'No physical roots';
            vHtml = '-';
            devHtml = '-';
        }
        
        tr.innerHTML = `
            <td data-label="Equation">${name}</td>
            <td data-label="Z (Compressibility)">${zHtml}</td>
            <td data-label="V (L/mol)">${vHtml}</td>
            <td data-label="% Dev Ideal">${devHtml}</td>
        `;
        tableBody.appendChild(tr);
    }
    
    renderChart(results);
});

// Trigger MathJax typeset on load if needed
if (window.MathJax) {
    MathJax.typesetPromise();
}
