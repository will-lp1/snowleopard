"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage"; // Assuming this hook exists or will be created

// Define storage keys if not already centralized
const STORAGE_KEYS = {
  MCP_SERVERS: "mcp-servers",
  SELECTED_MCP_SERVERS: "selected-mcp-servers",
  // Add other keys if useLocalStorage in snow-leopard uses a shared object
};

// Define types for MCP server
export interface KeyValuePair {
  key: string;
  value: string;
}

export interface MCPServer {
  id: string;
  name: string;
  url: string;
  type: 'sse' | 'stdio'; // Supported types
  command?: string;
  args?: string[];
  env?: KeyValuePair[];
  headers?: KeyValuePair[];
  description?: string;
}

// Type for processed MCP server config for API (to be sent to backend)
export interface MCPServerApi {
  name?: string; // Include name for easier logging/debugging on backend
  url: string;
  type: 'sse' | 'stdio';
  command?: string;
  args?: string[];
  env?: KeyValuePair[];
  headers?: KeyValuePair[];
}

interface MCPContextType {
  mcpServers: MCPServer[];
  setMcpServers: (servers: MCPServer[]) => void;
  selectedMcpServers: string[]; // Array of server IDs
  setSelectedMcpServers: (serverIds: string[]) => void;
  mcpServersForApi: MCPServerApi[];
  // Potentially add functions to add, edit, remove servers if not handled solely by MCPServerManager component
}

const MCPContext = createContext<MCPContextType | undefined>(undefined);

export function MCPProvider({ children }: { children: React.ReactNode }) {
  const [mcpServers, setMcpServers] = useLocalStorage<MCPServer[]>(
    STORAGE_KEYS.MCP_SERVERS, 
    []
  );
  const [selectedMcpServers, setSelectedMcpServers] = useLocalStorage<string[]>(
    STORAGE_KEYS.SELECTED_MCP_SERVERS, 
    []
  );
  const [mcpServersForApi, setMcpServersForApi] = useState<MCPServerApi[]>([]);

  // Process MCP servers for API consumption whenever server data or selection changes
  useEffect(() => {
    if (!selectedMcpServers || selectedMcpServers.length === 0) {
      setMcpServersForApi([]);
      return;
    }
    
    const processedServers: MCPServerApi[] = selectedMcpServers
      .map(id => mcpServers.find(server => server.id === id))
      .filter((server): server is MCPServer => Boolean(server)) // Type guard
      .map(server => ({
        name: server.name, // Pass name for backend logging
        type: server.type,
        url: server.url, // URL is primary for SSE
        command: server.command,
        args: server.args,
        env: server.env,
        headers: server.headers
      }));
    
    setMcpServersForApi(processedServers);
  }, [mcpServers, selectedMcpServers]);

  return (
    <MCPContext.Provider 
      value={{ 
        mcpServers, 
        setMcpServers, 
        selectedMcpServers, 
        setSelectedMcpServers,
        mcpServersForApi 
      }}
    >
      {children}
    </MCPContext.Provider>
  );
}

export function useMCP() {
  const context = useContext(MCPContext);
  if (context === undefined) {
    throw new Error("useMCP must be used within an MCPProvider");
  }
  return context;
} 