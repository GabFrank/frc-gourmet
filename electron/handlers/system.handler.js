"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSystemHandlers = void 0;
const electron_1 = require("electron");
const os = __importStar(require("os"));
function registerSystemHandlers() {
    // IPC handler to get the system MAC address
    electron_1.ipcMain.handle('get-system-mac-address', async () => {
        try {
            const networkInterfaces = os.networkInterfaces();
            // Find the first non-internal MAC address
            for (const interfaceName in networkInterfaces) {
                const interfaces = networkInterfaces[interfaceName];
                if (!interfaces)
                    continue;
                for (const iface of interfaces) {
                    // Skip internal and non-IPv4 interfaces, or non-ethernet types
                    if (!iface.internal && iface.family === 'IPv4' && iface.mac !== '00:00:00:00:00:00') {
                        return iface.mac;
                    }
                }
            }
            // If no suitable interface was found
            console.warn('Could not find a suitable MAC address.');
            return ''; // Return empty string if none found
        }
        catch (error) {
            console.error('Error getting system MAC address:', error);
            return ''; // Return empty string on error
        }
    });
}
exports.registerSystemHandlers = registerSystemHandlers;
//# sourceMappingURL=system.handler.js.map