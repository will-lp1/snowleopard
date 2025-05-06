"use client";

import React, { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogClose,
} from "@/components/ui/dialog"; // Assuming these are your dialog components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    PlusCircle,
    ServerIcon,
    XIcon,
    Terminal,
    Globe,
    Trash2,
    Edit2,
    Eye,
    EyeOff,
    ChevronDown,
    ChevronUp
} from "lucide-react";
import { toast } from "sonner";
import { 
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from "@/components/ui/accordion"; // Assuming accordion components
import { KeyValuePair, MCPServer, useMCP } from "@/lib/context/mcp-context";
import { cn } from "@/lib/utils";

// Default template for a new MCP server
const INITIAL_NEW_SERVER_DATA: Omit<MCPServer, 'id'> = {
    name: '',
    url: '',
    type: 'sse', // Default to SSE
    command: '',
    args: [],
    env: [],
    headers: [],
    description: ''
};

interface MCPServerManagerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const isSensitiveKey = (key: string): boolean => {
    const sensitivePatterns = [/key/i, /token/i, /secret/i, /password/i, /pass/i, /auth/i, /credential/i];
    return sensitivePatterns.some(pattern => pattern.test(key));
};

const maskValue = (value: string): string => {
    if (!value) return '';
    if (value.length < 8) return '••••••';
    return value.substring(0, 3) + '•'.repeat(Math.min(10, value.length - 4)) + value.substring(value.length - 1);
};


export const MCPServerManager = ({ open, onOpenChange }: MCPServerManagerProps) => {
    const { 
        mcpServers, 
        setMcpServers, 
        selectedMcpServers, 
        setSelectedMcpServers 
    } = useMCP();

    const [isAdding, setIsAdding] = useState(false);
    const [editingServer, setEditingServer] = useState<MCPServer | null>(null);
    const [currentServerData, setCurrentServerData] = useState<Omit<MCPServer, 'id'>>(INITIAL_NEW_SERVER_DATA);
    
    // For handling key-value pairs like headers and env vars
    const [newPair, setNewPair] = useState<KeyValuePair>({ key: '', value: '' });
    type PairType = 'headers' | 'env';
    const [currentPairType, setCurrentPairType] = useState<PairType>('headers');
    const [showSensitiveValues, setShowSensitiveValues] = useState<Record<string, Record<number, boolean>>>({}); // { serverId_pairType: { index: boolean } }


    useEffect(() => {
        if (editingServer) {
            setCurrentServerData({
                name: editingServer.name,
                url: editingServer.url,
                type: editingServer.type,
                command: editingServer.command || '',
                args: editingServer.args || [],
                env: editingServer.env || [],
                headers: editingServer.headers || [],
                description: editingServer.description || ''
            });
        } else {
            setCurrentServerData(INITIAL_NEW_SERVER_DATA);
        }
    }, [editingServer]);

    const handleCloseDialog = () => {
        setIsAdding(false);
        setEditingServer(null);
        setCurrentServerData(INITIAL_NEW_SERVER_DATA);
        setNewPair({ key: '', value: '' });
        onOpenChange(false);
    };

    const handleSaveServer = () => {
        if (!currentServerData.name) {
            toast.error("Server name is required");
            return;
        }
        if (currentServerData.type === 'sse' && !currentServerData.url) {
            toast.error("URL is required for SSE type servers");
            return;
        }
        if (currentServerData.type === 'stdio' && !currentServerData.command) {
            toast.error("Command is required for STDIO type servers");
            return;
        }

        if (editingServer) {
            // Update existing server
            const updatedServers = mcpServers.map(s => 
                s.id === editingServer.id ? { ...editingServer, ...currentServerData } : s
            );
            setMcpServers(updatedServers);
            toast.success(`Server "${currentServerData.name}" updated.`);
        } else {
            // Add new server
            const newServerWithId: MCPServer = { ...currentServerData, id: crypto.randomUUID() };
            setMcpServers([...mcpServers, newServerWithId]);
            toast.success(`Server "${currentServerData.name}" added.`);
        }
        handleCloseDialog();
    };

    const handleDeleteServer = (serverId: string) => {
        setMcpServers(mcpServers.filter(s => s.id !== serverId));
        setSelectedMcpServers(selectedMcpServers.filter(id => id !== serverId));
        toast.success("Server removed.");
        if (editingServer?.id === serverId) {
            handleCloseDialog();
        }
    };

    const handleToggleSelectServer = (serverId: string) => {
        const isSelected = selectedMcpServers.includes(serverId);
        if (isSelected) {
            setSelectedMcpServers(selectedMcpServers.filter(id => id !== serverId));
        } else {
            setSelectedMcpServers([...selectedMcpServers, serverId]);
        }
    };
    
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setCurrentServerData(prev => ({ ...prev, [name]: value }));
    };
    
    const handleTypeChange = (type: 'sse' | 'stdio') => {
        setCurrentServerData(prev => ({ ...prev, type }));
    };

    const handleArgsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Args are stored as an array of strings, input is a single string
        setCurrentServerData(prev => ({ ...prev, args: e.target.value.split(' ').filter(Boolean) }));
    };
    
    const handleAddPair = (type: PairType) => {
        if (!newPair.key) {
            toast.error("Key is required for " + type.slice(0, -1));
            return;
        }
        setCurrentServerData(prev => ({
            ...prev,
            [type]: [...(prev[type] || []), newPair]
        }));
        setNewPair({ key: '', value: '' });
    };

    const handleRemovePair = (type: PairType, index: number) => {
        setCurrentServerData(prev => ({
            ...prev,
            [type]: (prev[type] || []).filter((_, i) => i !== index)
        }));
    };
    
    const toggleSensitiveValueVisibility = (serverId: string, type: PairType, index: number) => {
        const key = `${serverId}_${type}`;
        setShowSensitiveValues(prev => ({
            ...prev,
            [key]: {
                ...(prev[key] || {}),
                [index]: !((prev[key] || {})[index])
            }
        }));
    };


    const renderKeyValuePairs = (pairs: KeyValuePair[], type: PairType, serverIdForVisibility: string) => {
        return (
            <div className="space-y-2">
                {pairs.map((pair, index) => (
                    <div key={index} className="flex items-center gap-2">
                        <Input value={pair.key} readOnly className="flex-1 bg-muted/50" />
                        <div className="flex-1 relative">
                             <Input 
                                value={
                                    isSensitiveKey(pair.key) && !(showSensitiveValues[`${serverIdForVisibility}_${type}`]?.[index])
                                        ? maskValue(pair.value)
                                        : pair.value
                                }
                                readOnly 
                                className="pr-8 bg-muted/50" // Padding for the eye icon
                            />
                            {isSensitiveKey(pair.key) && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-1/2 transform -translate-y-1/2 h-7 w-7"
                                    onClick={() => toggleSensitiveValueVisibility(serverIdForVisibility, type, index)}
                                >
                                    {(showSensitiveValues[`${serverIdForVisibility}_${type}`]?.[index]) ? <EyeOff size={14} /> : <Eye size={14} />}
                                </Button>
                            )}
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => handleRemovePair(type, index)} className="text-destructive hover:text-destructive">
                            <Trash2 size={16} />
                        </Button>
                    </div>
                ))}
                <div className="flex items-center gap-2 pt-1">
                    <Input 
                        placeholder="Key" 
                        value={newPair.key} 
                        onChange={(e) => { setCurrentPairType(type); setNewPair(p => ({ ...p, key: e.target.value }));}} 
                        className="flex-1"
                    />
                    <Input 
                        placeholder="Value" 
                        value={newPair.value} 
                        onChange={(e) => { setCurrentPairType(type); setNewPair(p => ({ ...p, value: e.target.value }));}} 
                        className="flex-1"
                    />
                    <Button variant="outline" size="sm" onClick={() => handleAddPair(type)}>Add</Button>
                </div>
            </div>
        );
    };
    
    const renderServerForm = () => (
        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto px-1">
            <div className="space-y-1">
                <Label htmlFor="server-name">Server Name</Label>
                <Input id="server-name" name="name" value={currentServerData.name} onChange={handleInputChange} />
            </div>
            <div className="space-y-1">
                <Label htmlFor="server-description">Description (Optional)</Label>
                <Input id="server-description" name="description" value={currentServerData.description} onChange={handleInputChange} />
            </div>

            <div className="space-y-1">
                <Label>Transport Type</Label>
                <div className="flex gap-2">
                    <Button variant={currentServerData.type === 'sse' ? "secondary" : "outline"} onClick={() => handleTypeChange('sse')}>
                        <Globe size={14} className="mr-2" /> SSE (HTTP)
                    </Button>
                    <Button variant={currentServerData.type === 'stdio' ? "secondary" : "outline"} onClick={() => handleTypeChange('stdio')}>
                        <Terminal size={14} className="mr-2" /> STDIO (Local)
                    </Button>
                </div>
            </div>

            {currentServerData.type === 'sse' && (
                <div className="space-y-1">
                    <Label htmlFor="server-url">Server URL</Label>
                    <Input id="server-url" name="url" value={currentServerData.url} onChange={handleInputChange} placeholder="https://example.com/mcp/sse"/>
                </div>
            )}

            {currentServerData.type === 'stdio' && (
                <>
                    <div className="space-y-1">
                        <Label htmlFor="server-command">Command</Label>
                        <Input id="server-command" name="command" value={currentServerData.command} onChange={handleInputChange} placeholder="e.g., node, python3, ./my-script"/>
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="server-args">Arguments (space separated)</Label>
                        <Input id="server-args" name="args" value={(currentServerData.args || []).join(' ')} onChange={handleArgsChange} placeholder="e.g., server.js -p 8080"/>
                    </div>
                    <div className="space-y-1">
                        <Label>Environment Variables</Label>
                        {renderKeyValuePairs(currentServerData.env || [], 'env', editingServer?.id || 'new')}
                    </div>
                </>
            )}
            
            <div className="space-y-1">
                <Label>Headers (for SSE)</Label>
                {renderKeyValuePairs(currentServerData.headers || [], 'headers', editingServer?.id || 'new')}
            </div>
            
            <DialogFooter className="pt-4">
                <Button variant="ghost" onClick={handleCloseDialog}>Cancel</Button>
                <Button onClick={handleSaveServer}>
                    {editingServer ? "Save Changes" : "Add Server"}
                </Button>
            </DialogFooter>
        </div>
    );

    const renderServerList = () => (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto px-1 py-2">
            {mcpServers.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No MCP servers configured yet.</p>
            )}
            <Accordion type="multiple" className="w-full">
                {mcpServers.map(server => (
                    <AccordionItem value={server.id} key={server.id} className="border-b">
                        <div className="flex items-center py-2 pr-2">
                            <Switch 
                                id={`select-${server.id}`}
                                checked={selectedMcpServers.includes(server.id)}
                                onCheckedChange={() => handleToggleSelectServer(server.id)}
                                className="mr-3"
                            />
                            <AccordionTrigger className="flex-1 py-0 text-left">
                                <div className="flex items-center gap-2">
                                   {server.type === 'sse' ? <Globe size={14} /> : <Terminal size={14} />}
                                    <span className="font-medium">{server.name}</span>
                                    <span className="text-xs text-muted-foreground truncate max-w-[150px] sm:max-w-[200px]">
                                        {server.description || (server.type === 'sse' ? server.url : server.command)}
                                    </span>
                                </div>
                            </AccordionTrigger>
                            <Button variant="ghost" size="icon" className="ml-2 h-8 w-8" onClick={() => { setEditingServer(server); setIsAdding(true); }}>
                                <Edit2 size={16} />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-8 w-8" onClick={() => handleDeleteServer(server.id)}>
                                <Trash2 size={16} />
                            </Button>
                        </div>
                        <AccordionContent className="pl-[46px] pr-2 pb-3 text-sm">
                            <div className="space-y-3">
                                {server.description && <p className="text-muted-foreground text-xs">{server.description}</p>}
                                <div>
                                    <strong>URL/Command:</strong> {server.type === 'sse' ? server.url : `${server.command} ${(server.args || []).join(' ')}`}
                                </div>
                                {server.headers && server.headers.length > 0 && (
                                    <div>
                                        <strong>Headers:</strong>
                                        <div className="pl-2 mt-1 space-y-1">
                                            {server.headers.map((h, i) => (
                                                 <div key={i} className="flex items-center gap-1 text-xs">
                                                    <span>{h.key}:</span>
                                                    <span className="font-mono bg-muted/50 px-1 py-0.5 rounded">
                                                         {isSensitiveKey(h.key) && !(showSensitiveValues[`${server.id}_headers`]?.[i])
                                                            ? maskValue(h.value)
                                                            : h.value}
                                                    </span>
                                                    {isSensitiveKey(h.key) && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-5 w-5"
                                                            onClick={() => toggleSensitiveValueVisibility(server.id, 'headers', i)}
                                                        >
                                                            {(showSensitiveValues[`${server.id}_headers`]?.[i]) ? <EyeOff size={12} /> : <Eye size={12} />}
                                                        </Button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {server.env && server.env.length > 0 && (
                                     <div>
                                        <strong>Environment:</strong>
                                        <div className="pl-2 mt-1 space-y-1">
                                            {server.env.map((e, i) => (
                                                <div key={i} className="flex items-center gap-1 text-xs">
                                                    <span>{e.key}:</span>
                                                    <span className="font-mono bg-muted/50 px-1 py-0.5 rounded">
                                                        {isSensitiveKey(e.key) && !(showSensitiveValues[`${server.id}_env`]?.[i])
                                                            ? maskValue(e.value)
                                                            : e.value}
                                                    </span>
                                                    {isSensitiveKey(e.key) && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-5 w-5"
                                                            onClick={() => toggleSensitiveValueVisibility(server.id, 'env', i)}
                                                        >
                                                            {(showSensitiveValues[`${server.id}_env`]?.[i]) ? <EyeOff size={12} /> : <Eye size={12} />}
                                                        </Button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
             <DialogFooter className={cn("pt-4", isAdding ? "hidden": "")}>
                <Button onClick={() => { setIsAdding(true); setEditingServer(null); setCurrentServerData(INITIAL_NEW_SERVER_DATA); }}>
                    <PlusCircle size={16} className="mr-2"/> Add New Server
                </Button>
            </DialogFooter>
        </div>
    );


    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) handleCloseDialog(); else onOpenChange(o);}}>
            <DialogContent className="sm:max-w-lg md:max-w-xl lg:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>
                        {isAdding || editingServer ? (editingServer ? "Edit MCP Server" : "Add New MCP Server") : "Manage MCP Servers"}
                    </DialogTitle>
                    <DialogDescription>
                        {isAdding || editingServer 
                            ? "Configure the details for the MCP server."
                            : "Enable, disable, or configure MCP servers to extend AI capabilities."}
                    </DialogDescription>
                </DialogHeader>
                
                {isAdding || editingServer ? renderServerForm() : renderServerList()}

            </DialogContent>
        </Dialog>
    );
}; 