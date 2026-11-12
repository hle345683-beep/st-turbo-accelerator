/**
 * TEST RUNNER — BỘ ĐIỀU PHỐI KIỂM THỬ TOÀN DIỆN CHO ST-TURBO-ACCELERATOR
 * Chạy tuần tự 8/8 Test Suites từ P1 đến P8, tổng hợp kết quả độc lập không phụ thuộc đường dẫn cá nhân.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const suites = [
    { name: 'P1: WAL Engine & Fast PNG Metadata Extractor', file: 'test_p1.js' },
    { name: 'P2: WASM LZ4 Chat Vault & Memory Compaction', file: 'test_p2.js' },
    { name: 'P3: DOM Virtual Scroller & Anti-OOM Recycling', file: 'test_p3.js' },
    { name: 'P4: CoW Proxy Guard & Full System Integration', file: 'test_p4_integration.js' },
    { name: 'P5: Red-Team Security, Fuzzing & Unicode Aho-Corasick Audit', file: 'test_p5_audit.js' },
    { name: 'P6: CSS Compositor Guard & Animation Freeze', file: 'test_p6_compositor.js' },
    { name: 'P7: Canvas Motion Throttler (0/30/60 FPS)', file: 'test_p7_canvas.js' },
    { name: 'P8: End-to-End System Integration & 1-Click Release', file: 'test_p8_e2e_release.js' }
];

console.log('='.repeat(75));
console.log('   ST-TURBO-ACCELERATOR — BẮT ĐẦU CHẠY TOÀN BỘ 8/8 TEST SUITES');
console.log('='.repeat(75));

const startTime = Date.now();
let totalPassedSuites = 0;
let totalFailedSuites = 0;
const results = [];

for (const suite of suites) {
    const suiteFilePath = path.join(__dirname, suite.file);
    process.stdout.write(`\n>>> ĐANG CHẠY [${suite.name}] (${suite.file}) ...\n`);
    const suiteStart = Date.now();
    const result = spawnSync('node', [suiteFilePath], {
        cwd: __dirname,
        stdio: 'inherit',
        env: process.env
    });
    const suiteDuration = ((Date.now() - suiteStart) / 1000).toFixed(2);

    if (result.status === 0) {
        totalPassedSuites++;
        results.push({ name: suite.name, file: suite.file, status: 'PASS', time: `${suiteDuration}s` });
        console.log(`\n\x1b[32m✔ [PASS] ${suite.name} hoàn thành trong ${suiteDuration}s\x1b[0m`);
    } else {
        totalFailedSuites++;
        results.push({ name: suite.name, file: suite.file, status: 'FAIL', time: `${suiteDuration}s` });
        console.log(`\n\x1b[31m✘ [FAIL] ${suite.name} thất bại (Exit code: ${result.status})\x1b[0m`);
    }
}

const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);

console.log('\n' + '='.repeat(75));
console.log('                     TỔNG KẾT BẢNG ĐIỂM KIỂM THỬ');
console.log('='.repeat(75));

for (const r of results) {
    const badge = r.status === 'PASS' ? '\x1b[32m[PASS]\x1b[0m' : '\x1b[31m[FAIL]\x1b[0m';
    console.log(` ${badge} ${r.name.padEnd(60)} : ${r.time}`);
}

console.log('-'.repeat(75));
console.log(`Kết quả: ${totalPassedSuites}/${suites.length} Suites ĐẠT CHUẨN (${totalDuration}s)`);
console.log('='.repeat(75) + '\n');

if (totalFailedSuites > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
