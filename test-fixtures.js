/**
 * TEST-FIXTURES.JS — TỰ ĐỘNG TẠO DỮ LIỆU KIỂM THỬ ĐỘC LẬP (SELF-CONTAINED FIXTURES)
 * Dự án: ST-RUST-ACCELERATOR / ST-TURBO-ACCELERATOR
 * Cho phép toàn bộ Test Suite (P1 -> P8) chạy thành công độc lập trên mọi máy tính và CI/CD.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');
if (!fs.existsSync(FIXTURES_DIR)) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
}

const FIXTURE_CHAT_PATH = path.join(FIXTURES_DIR, 'mock-genshin-chat.jsonl');
const FIXTURE_CARD_PATH = path.join(FIXTURES_DIR, 'mock-genshin-card.png');
const FIXTURE_WORLDBOOK_PATH = path.join(FIXTURES_DIR, 'mock-worldbook.json');

function getChatPath(preferredPath) {
    if (preferredPath && fs.existsSync(preferredPath)) {
        return preferredPath;
    }
    if (!fs.existsSync(FIXTURE_CHAT_PATH) || fs.statSync(FIXTURE_CHAT_PATH).size < 30 * 1024 * 1024) {
        createMockChatFileSync(FIXTURE_CHAT_PATH);
    }
    return FIXTURE_CHAT_PATH;
}

function getCardPath(preferredPath) {
    if (preferredPath && fs.existsSync(preferredPath)) {
        return preferredPath;
    }
    if (!fs.existsSync(FIXTURE_CARD_PATH) || fs.statSync(FIXTURE_CARD_PATH).size < 40 * 1024 * 1024) {
        createMockCardPngSync(FIXTURE_CARD_PATH);
    }
    return FIXTURE_CARD_PATH;
}

function getWorldbookPath(preferredPath) {
    if (preferredPath && fs.existsSync(preferredPath)) {
        return preferredPath;
    }
    if (!fs.existsSync(FIXTURE_WORLDBOOK_PATH)) {
        createMockWorldbookFileSync(FIXTURE_WORLDBOOK_PATH);
    }
    return FIXTURE_WORLDBOOK_PATH;
}

function createMockChatFileSync(outPath) {
    console.log(`[FIXTURE] Đang tự động tạo file chat giả lập chuẩn 32MB tại: ${outPath}...`);
    
    const vocab = [
        "Khám phá lục địa Teyvat huyền bí", "bảy vị thần cai quản các nguyên tố",
        "Phong Ma Long Dvalin gầm vang", "Thành Mondstadt nơi gió tự do",
        "Đội Kỵ Sĩ Tây Phong Jean", "thủ thư tài ba Lisa", "Giáo Đoàn Vực Sâu",
        "Diluc Quán Rượu Đuôi Mèo", "Amber đôi cánh gió", "Nham Vương Đế Quân Morax",
        "Lôi Thần Raiden Shogun vĩnh hằng", "Thảo Thần Nahida Cây Thế Giới",
        "Thủy Thần Furina Neuvillette", "Hỏa Thần Mavuika chiến binh", "Fatui Tsaritsa Gnosis"
    ];

    const entries = [];
    const count = 360000;
    for (let i = 0; i < count; i++) {
        // Kết hợp từ vựng và hash giả định để tạo entropy chuẩn cho tỷ lệ nén LZ4 ~32%
        const entropySeed = ((i * 1664525 + 1013904223) >>> 0).toString(16);
        entries.push({
            id: i,
            uid: `rec_${entropySeed}`,
            t: vocab[i % vocab.length],
            c: `lore_${i % 12}`,
            h: entropySeed
        });
    }

    const line0Obj = {
        user_name: "Sensei",
        character_name: "Genshin Impact · Teyvat",
        create_date: Date.now(),
        chat_metadata: {
            scenario: "Lữ Hành Giả phiêu lưu tại thế giới Teyvat rộng lớn, gặp gỡ Paimon, Jean, Amber, Diluc, Venti.",
            lore_db: entries
        }
    };
    const line0Str = JSON.stringify(line0Obj);

    const fd = fs.openSync(outPath, 'w');
    fs.writeSync(fd, line0Str + '\n');

    // Thêm chính xác 50 tin nhắn hợp lệ
    for (let i = 1; i <= 50; i++) {
        const charName = i % 2 === 1 ? 'Sensei' : 'Tawa';
        const msg = {
            name: charName,
            is_user: i % 2 === 1,
            is_name: true,
            send_date: Date.now() + i * 1000,
            mes: `Tin nhắn số #${i} kiểm thử hệ thống Teyvat Genshin: ${vocab[i % vocab.length]}`,
            swipes: [`Swipe 1 gốc #${i}`]
        };
        fs.writeSync(fd, JSON.stringify(msg) + '\n');
    }
    fs.closeSync(fd);
}

function createMockCardPngSync(outPath) {
    console.log(`[FIXTURE] Đang tự động tạo file character card PNG 42MB tại: ${outPath}...`);
    const cardData = {
        name: "Genshin Impact · Teyvat",
        description: "Thế giới Teyvat khổng lồ với 7 quốc gia thần linh.",
        json_data: "A".repeat(42 * 1024 * 1024),
        data: {
            name: "Genshin Impact · Teyvat",
            description: "Thế giới Teyvat khổng lồ"
        }
    };
    const jsonStr = JSON.stringify(cardData);
    const b64Payload = Buffer.from(jsonStr, 'utf8').toString('base64');

    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    // IHDR
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(100, 0);
    ihdrData.writeUInt32BE(100, 4);
    ihdrData.writeUInt8(8, 8);
    ihdrData.writeUInt8(6, 9);
    ihdrData.writeUInt8(0, 10);
    ihdrData.writeUInt8(0, 11);
    ihdrData.writeUInt8(0, 12);
    const ihdrChunk = makeChunk('IHDR', ihdrData);

    // tEXt chara chunk
    const textData = Buffer.concat([Buffer.from('chara\0', 'ascii'), Buffer.from(b64Payload, 'ascii')]);
    const textChunk = makeChunk('tEXt', textData);

    // IDAT chunk
    const rawPixels = Buffer.alloc(100 * (100 * 4 + 1));
    const compressedPixels = zlib.deflateSync(rawPixels);
    const idatChunk = makeChunk('IDAT', compressedPixels);

    // IEND
    const iendChunk = makeChunk('IEND', Buffer.alloc(0));

    const finalBuf = Buffer.concat([signature, ihdrChunk, textChunk, idatChunk, iendChunk]);
    fs.writeFileSync(outPath, finalBuf);
}

function makeChunk(typeStr, dataBuf) {
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(dataBuf.length, 0);
    const typeBuf = Buffer.from(typeStr, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(0x12345678, 0);
    return Buffer.concat([lenBuf, typeBuf, dataBuf, crcBuf]);
}

function createMockWorldbookFileSync(outPath) {
    console.log(`[FIXTURE] Đang tự động tạo file Worldbook tại: ${outPath}...`);
    const keywordsList = [
        ["Lữ Hành Giả", "Aether", "Lumine"],
        ["Paimon", "Thức Ăn Dự Phòng"],
        ["Mondstadt", "Thành Phố Tự Do", "Thành Mondstadt"],
        ["Jean", "Đội Trưởng Đại Diện", "Kỵ Sĩ Bồ Công Anh"],
        ["Lisa", "Thủ Thư", "Phù Thủy Hoa Hồng"],
        ["Amber", "Kỵ Sĩ Trinh Sát", "Quán Quân Lượn Dù"],
        ["Diluc", "Lão Gia Diluc", "Anh Hùng Đêm"],
        ["Venti", "Phong Thần", "Barbatos", "Nhà Thơ Lang Thang"],
        ["Phong Ma Long", "Dvalin", "Rồng Đông Phong"],
        ["Giáo Đoàn Vực Sâu", "Pháp Sư Vực Sâu", "Sứ Đồ Vực Sâu"],
        ["Fatui", "Quan Chấp Chính", "Signora", "Tartaglia", "Scaramouche"],
        ["Đội Kỵ Sĩ Tây Phong", "Đền Sư Tử", "Rừng Danh Vọng", "Hồ Sao Rơi"],
        ["Quán Rượu Đuôi Mèo", "Đại Giáo Đường", "Quảng Trường Gió"],
        ["Liyue", "Nham Thần", "Morax", "Zhongli", "Nham Vương Đế Quân"],
        ["Inazuma", "Lôi Thần", "Raiden Shogun", "Baal", "Beelzebul"],
        ["Sumeru", "Thảo Thần", "Nahida", "Kusanali", "Viện Sumeru"]
    ];

    const entries = [];
    let entryId = 1;
    for (let loop = 0; loop < 40; loop++) {
        for (const kwGroup of keywordsList) {
            entries.push({
                id: entryId++,
                keys: kwGroup.map(k => (loop === 0 ? k : `${k} #${loop}`)),
                secondary_keys: [],
                comment: `Tài liệu bách khoa toàn thư mục #${entryId} về ${kwGroup[0]}`,
                content: `Chi tiết kiến thức về ${kwGroup[0]} trong lịch sử thần thoại thế giới Teyvat.`,
                enabled: true
            });
        }
    }

    const worldbook = {
        name: "Bách Khoa Toàn Thư Thế Giới Teyvat (Genshin Impact)",
        entries: entries
    };

    fs.writeFileSync(outPath, JSON.stringify(worldbook, null, 2), 'utf8');
}

module.exports = {
    getChatPath,
    getCardPath,
    getWorldbookPath,
    FIXTURE_CHAT_PATH,
    FIXTURE_CARD_PATH,
    FIXTURE_WORLDBOOK_PATH
};
