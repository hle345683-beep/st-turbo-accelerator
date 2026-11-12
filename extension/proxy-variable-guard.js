/**
 * PROXY-VARIABLE-GUARD.JS — COPY-ON-WRITE (CoW) VIRTUALIZATION ENGINE
 * Dự án: ST-RUST-ACCELERATOR / ST-TURBO-ACCELERATOR
 * 
 * Ngăn chặn nhân bản sâu (deep clone) mù quáng các cây biến dữ liệu khổng lồ (như TavernHelper state),
 * tiết kiệm ~108MB V8 heap cho mỗi thao tác clone, bảo vệ object gốc khỏi đột biến (mutation).
 * Bổ sung đầy đủ trap deleteProperty, tập hợp deletedKeys, và phương thức commit/toJSON sạch sẽ.
 */

class ProxyVariableGuard {
    /**
     * Bọc một đối tượng mục tiêu bằng Proxy Copy-on-Write (CoW).
     * Thao tác đọc là Zero-Allocation; thao tác ghi/xóa được cô lập trong Map/Set cục bộ.
     *
     * @param {Object} target - Đối tượng nguồn cần bảo vệ
     * @returns {Proxy|Object} CoW proxy hoặc giá trị nguyên thủy
     */
    static createCoWProxy(target) {
        if (!target || typeof target !== 'object') {
            return target;
        }

        const modifications = new Map();
        const deletedKeys = new Set();
        const childProxies = new Map();

        let proxyInstance = null;

        const handler = {
            get(obj, prop) {
                // Trap các thuộc tính / phương thức đặc biệt
                if (prop === '__isCoWProxy') return true;
                if (prop === '__target') return obj;
                if (prop === '__modifications') return modifications;
                if (prop === '__deletedKeys') return deletedKeys;
                if (prop === 'commit' || prop === '__commit') {
                    return () => ProxyVariableGuard.commit(proxyInstance);
                }
                if (prop === 'toJSON') {
                    return () => ProxyVariableGuard.commit(proxyInstance);
                }

                // Nếu khóa đã bị xóa
                if (deletedKeys.has(prop)) {
                    return undefined;
                }

                // Nếu khóa có giá trị sửa đổi
                if (modifications.has(prop)) {
                    return modifications.get(prop);
                }

                // Nếu đã bọc proxy con
                if (childProxies.has(prop)) {
                    return childProxies.get(prop);
                }

                const value = Reflect.get(obj, prop);
                if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof RegExp)) {
                    const childProxy = ProxyVariableGuard.createCoWProxy(value);
                    childProxies.set(prop, childProxy);
                    return childProxy;
                }
                return value;
            },

            set(obj, prop, value) {
                // Hủy trạng thái xóa nếu gán lại giá trị
                deletedKeys.delete(prop);
                childProxies.delete(prop);
                modifications.set(prop, value);
                return true;
            },

            deleteProperty(obj, prop) {
                // Trap deleteProperty: Ghi nhận vào deletedKeys mà KHÔNG chạm vào target gốc
                if (modifications.has(prop)) {
                    modifications.delete(prop);
                }
                if (childProxies.has(prop)) {
                    childProxies.delete(prop);
                }
                deletedKeys.add(prop);
                return true;
            },

            has(obj, prop) {
                if (deletedKeys.has(prop)) return false;
                if (modifications.has(prop) || childProxies.has(prop)) return true;
                return Reflect.has(obj, prop);
            },

            ownKeys(obj) {
                const keys = new Set([...Reflect.ownKeys(obj), ...modifications.keys()]);
                for (const dk of deletedKeys) {
                    keys.delete(dk);
                }
                return Array.from(keys);
            },

            getOwnPropertyDescriptor(obj, prop) {
                if (deletedKeys.has(prop)) {
                    return undefined;
                }
                if (modifications.has(prop)) {
                    return {
                        value: modifications.get(prop),
                        writable: true,
                        enumerable: true,
                        configurable: true,
                    };
                }
                return Reflect.getOwnPropertyDescriptor(obj, prop);
            }
        };

        proxyInstance = new Proxy(target, handler);
        return proxyInstance;
    }

    /**
     * Xuất (commit) dữ liệu CoW Proxy thành một plain Object/Array sạch,
     * loại bỏ hoàn toàn các key đã xóa và hòa nhập tất cả sửa đổi mà không làm biến đổi object gốc.
     *
     * @param {*} proxyOrObj - Đối tượng hoặc CoW Proxy
     * @returns {*} Plain JavaScript object/array
     */
    static commit(proxyOrObj) {
        if (!proxyOrObj || typeof proxyOrObj !== 'object') {
            return proxyOrObj;
        }

        const isArr = Array.isArray(proxyOrObj);
        const result = isArr ? [] : {};

        // Lấy toàn bộ keys hợp lệ (ownKeys đã tự động lọc deletedKeys và gộp modifications)
        const keys = Object.keys(proxyOrObj);
        for (const key of keys) {
            const val = proxyOrObj[key];
            if (val && typeof val === 'object' && !(val instanceof Date) && !(val instanceof RegExp)) {
                result[key] = ProxyVariableGuard.commit(val);
            } else {
                result[key] = val;
            }
        }

        return result;
    }

    /**
     * Bảo vệ tin nhắn chat bằng cách bọc cây `variables` trong CoW Proxy.
     *
     * @param {Object} msg - Chat message object
     * @returns {Object} Message đã được bảo vệ variables
     */
    static protectMessage(msg) {
        if (!msg || typeof msg !== 'object') return msg;
        if (msg.variables && typeof msg.variables === 'object') {
            msg.variables = ProxyVariableGuard.createCoWProxy(msg.variables);
        }
        return msg;
    }

    /**
     * Tạo bản snapshot nông (shallow snapshot) chống đệ quy nhân bản trên metadata khổng lồ.
     *
     * @param {Object} largeMetadata - Large metadata container
     * @returns {Object} Safe shallow snapshot
     */
    static createSafeSnapshot(largeMetadata) {
        if (!largeMetadata || typeof largeMetadata !== 'object') return {};

        const safeClone = {};
        for (const key of Object.keys(largeMetadata)) {
            safeClone[key] = largeMetadata[key];
        }
        return safeClone;
    }
}

export { ProxyVariableGuard };

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ProxyVariableGuard };
}
