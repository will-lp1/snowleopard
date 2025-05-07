"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    PlusCircle,
    ServerIcon,
    Terminal,
    Globe,
    Trash2,
    Edit2,
    Eye,
    EyeOff,
    X,
    Plus,
    Cog,
    ChevronDown,
    ChevronUp,
    Settings2
} from "lucide-react";
import { toast } from "sonner";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from "@/components/ui/accordion";
import { KeyValuePair, MCPServer, useMCP } from "@/lib/context/mcp-context";

const INITIAL_SERVER_FORM_DATA: Omit<MCPServer, 'id'> = {
    name: '',
    url: '',
    type: 'sse',
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

    const [view, setView] = useState<'list' | 'form'>('list');
    const [editingServer, setEditingServer] = useState<MCPServer | null>(null);
    const [currentServerData, setCurrentServerData] = useState<Omit<MCPServer, 'id'>>(INITIAL_SERVER_FORM_DATA);

    const [newEnvVar, setNewEnvVar] = useState<KeyValuePair>({ key: '', value: '' });
    const [newHeader, setNewHeader] = useState<KeyValuePair>({ key: '', value: '' });
    const [editingPair, setEditingPair] = useState<{ type: 'env' | 'headers', index: number, value: string } | null>(null);
    const [formSensitiveVisibility, setFormSensitiveVisibility] = useState<Record<string, Record<number, boolean>>>({ env: {}, headers: {} });

    useEffect(() => {
        if (!open) {
            setView('list');
            setEditingServer(null);
            setCurrentServerData(INITIAL_SERVER_FORM_DATA);
            setFormSensitiveVisibility({ env: {}, headers: {} });
            setNewEnvVar({ key: '', value: '' });
            setNewHeader({ key: '', value: '' });
            setEditingPair(null);
        } else if (open && view === 'form' && !editingServer) {
            setCurrentServerData(INITIAL_SERVER_FORM_DATA);
            setFormSensitiveVisibility({ env: {}, headers: {} });
        }
    }, [open, view, editingServer]);

    const resetFormAndGoToList = () => {
        setView('list');
        setEditingServer(null);
        setNewEnvVar({ key: '', value: '' });
        setNewHeader({ key: '', value: '' });
        setEditingPair(null);
        setFormSensitiveVisibility({ env: {}, headers: {} });
    };
    
    const handleDialogClose = () => {
        resetFormAndGoToList();
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
            const updatedServers = mcpServers.map(s =>
                s.id === editingServer.id ? { ...editingServer, ...currentServerData } : s
            );
            setMcpServers(updatedServers);
            toast.success(`Server "${currentServerData.name}" updated.`);
        } else {
            const newServerWithId: MCPServer = { ...currentServerData, id: crypto.randomUUID() };
            setMcpServers([...mcpServers, newServerWithId]);
            toast.success(`Server "${currentServerData.name}" added.`);
        }
        resetFormAndGoToList();
    };

    const handleDeleteServer = (serverId: string) => {
        setMcpServers(mcpServers.filter(s => s.id !== serverId));
        const newSelectedServers = selectedMcpServers.filter((id: string) => id !== serverId);
        setSelectedMcpServers(newSelectedServers);
        toast.success("Server removed.");
        if (editingServer?.id === serverId) {
            resetFormAndGoToList();
        }
    };
    
    const handleStartEdit = (server: MCPServer) => {
        setEditingServer(server);
        setCurrentServerData({
            name: server.name,
            url: server.url,
            type: server.type,
            command: server.command || '',
            args: server.args || [],
            env: server.env || [],
            headers: server.headers || [],
            description: server.description || ''
        });
        setFormSensitiveVisibility({ env: {}, headers: {} });
        setView('form');
    };

    const handleToggleEnableServer = (serverId: string) => {
        const currentlySelected = selectedMcpServers.includes(serverId);
        if (currentlySelected) {
            setSelectedMcpServers(selectedMcpServers.filter((id: string) => id !== serverId));
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
         const value = e.target.value;
         try {
            const argsArray = value.trim().startsWith('[') && value.trim().endsWith(']')
                ? JSON.parse(value)
                : value.split(' ').filter(Boolean);
            setCurrentServerData(prev => ({ ...prev, args: argsArray }));
        } catch (error) {
            setCurrentServerData(prev => ({ ...prev, args: value.split(' ').filter(Boolean) }));
        }
    };

    const addPair = (type: 'env' | 'headers') => {
        const pairToAdd = type === 'env' ? newEnvVar : newHeader;
        if (!pairToAdd.key) {
            toast.error(`Key is required for ${type === 'env' ? 'environment variable' : 'header'}`);
            return;
        }
        setCurrentServerData(prev => ({
            ...prev,
            [type]: [...(prev[type] || []), { ...pairToAdd }]
        }));
        if (type === 'env') setNewEnvVar({ key: '', value: '' });
        else setNewHeader({ key: '', value: '' });
    };

    const removePair = (type: 'env' | 'headers', index: number) => {
        setCurrentServerData(prev => ({
            ...prev,
            [type]: (prev[type] || []).filter((_, i) => i !== index)
        }));
        setFormSensitiveVisibility(prev => ({
            ...prev,
            [type]: Object.fromEntries(Object.entries(prev[type] || {}).filter(([key]) => parseInt(key) !== index))
        }));
        if (editingPair?.type === type && editingPair?.index === index) {
            setEditingPair(null);
        }
    };
    
    const startEditPairValue = (type: 'env' | 'headers', index: number, value: string) => {
        setEditingPair({ type, index, value });
    };

    const saveEditedPairValue = () => {
        if (!editingPair) return;
        const { type, index, value } = editingPair;
        const updatedPairs = [...(currentServerData[type] || [])];
        updatedPairs[index] = { ...updatedPairs[index], value: value };
        setCurrentServerData(prev => ({ ...prev, [type]: updatedPairs }));
        setEditingPair(null);
    };
    
    const toggleFormSensitiveVisibility = (type: 'env' | 'headers', index: number) => {
        setFormSensitiveVisibility(prev => ({
            ...prev,
            [type]: {
                ...(prev[type] || {}),
                [index]: !((prev[type] || {})[index])
            }
        }));
    };

    const renderServerList = () => (
        <div className="flex-1 px-0 py-1 space-y-1.5">
            {mcpServers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-6">
                    <ServerIcon className="h-9 w-9 text-muted-foreground/60 mb-2.5" />
                    <h3 className="text-sm font-medium text-foreground">No MCP Servers Configured</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Add a server to connect external AI tools.</p>
                </div>
            ) : (
                mcpServers.map(server => {
                    const isActive = selectedMcpServers.includes(server.id);
                    return (
                        <div 
                            key={server.id} 
                            className={`flex items-center pl-2 pr-1.5 py-2 border rounded-md hover:border-border dark:hover:border-input ${isActive ? 'bg-secondary dark:bg-muted/70 border-border dark:border-input' : 'bg-background dark:bg-muted/40 border-transparent dark:border-transparent'}`}
                        >
                            <div className="mr-2 flex-shrink-0">
                                <Switch
                                    checked={isActive}
                                    onCheckedChange={() => handleToggleEnableServer(server.id)}
                                    className="h-4 w-7 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input transform scale-[0.8] origin-center"
                                />
                            </div>
                            <div className="flex-grow min-w-0 cursor-default" onClick={() => handleStartEdit(server)}>
                                <h4 className={`font-medium text-sm truncate ${isActive ? 'text-primary dark:text-primary-foreground' : 'text-foreground'}`}>{server.name}</h4>
                                <p className="text-xs text-muted-foreground truncate">
                                    {server.description || (server.type === 'sse' ? server.url : server.command)}
                                </p>
                            </div>
                            <div className="flex-shrink-0 flex items-center gap-0 ml-1.5">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleStartEdit(server)}>
                                    <Settings2 size={14} className="text-muted-foreground group-hover:text-foreground"/>
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteServer(server.id)}>
                                    <Trash2 size={14} className="text-muted-foreground hover:text-destructive"/>
                                </Button>
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
    
    const renderKeyValueFormSection = (type: 'env' | 'headers') => {
        const title = type === 'env' ? "Environment Variables" : "HTTP Headers";
        const currentPairs = currentServerData[type] || [];
        const newPairState = type === 'env' ? newEnvVar : newHeader;
        const setNewPairState = type === 'env' ? setNewEnvVar : setNewHeader;

        return (
            <AccordionItem value={type} className="border-x-0 border-b-0 last:border-b-0">
                <AccordionTrigger className="py-2 px-1 text-xs hover:no-underline text-muted-foreground hover:text-foreground data-[state=open]:text-foreground flex items-center justify-start">
                    <Cog size={13} className="mr-1.5 flex-shrink-0"/> {title}
                </AccordionTrigger>
                <AccordionContent className="pt-1.5 pb-2.5 px-1 space-y-2">
                    {currentPairs.map((pair, index) => (
                        <div key={`${type}-${index}`} className="flex items-center gap-1.5">
                            <Input value={pair.key} readOnly className="h-9 bg-muted/50 flex-auto text-xs" tabIndex={-1}/>
                            <div className="relative flex-auto">
                                {editingPair?.type === type && editingPair?.index === index ? (
                                    <div className="flex items-center gap-1">
                                        <Input
                                            className={`h-9 text-xs flex-auto`}
                                            value={editingPair.value}
                                            onChange={(e) => setEditingPair({...editingPair, value: e.target.value})}
                                            onKeyDown={(e) => { if (e.key === 'Enter') saveEditedPairValue(); if (e.key === 'Escape') setEditingPair(null);}}
                                            autoFocus
                                        />
                                        <Button size="sm" variant="ghost" onClick={saveEditedPairValue} className="h-7 px-1.5 text-xs">Save</Button> 
                                        <Button size="sm" variant="ghost" onClick={() => setEditingPair(null)} className="h-7 px-1.5"><X size={12}/></Button>
                                    </div>
                                ) : (
                                    <div className="relative group">
                                        <Input 
                                            readOnly 
                                            value={isSensitiveKey(pair.key) && !(formSensitiveVisibility[type]?.[index]) ? maskValue(pair.value) : pair.value}
                                            className={`h-9 text-xs bg-muted/50 truncate cursor-pointer hover:bg-muted/70 pr-10`}
                                            onClick={() => startEditPairValue(type, index, pair.value)}
                                            tabIndex={0}
                                        />
                                        <div className="absolute right-0.5 top-0 h-full flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                            {isSensitiveKey(pair.key) && (
                                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleFormSensitiveVisibility(type, index)} tabIndex={-1}>
                                                    {formSensitiveVisibility[type]?.[index] ? <EyeOff size={13} /> : <Eye size={13} />}
                                                </Button>
                                            )}
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removePair(type, index)} tabIndex={-1}>
                                                <Trash2 size={13} />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {currentPairs.length === 0 && <p className="text-xs text-muted-foreground text-center pt-1">No {title.toLowerCase()} added.</p>}
                    <div className="flex items-end gap-1.5 pt-1">
                        <div className="flex-grow">
                            <Label htmlFor={`${type}-key-input`} className="text-xs font-medium text-muted-foreground ml-0.5 mb-1">Key</Label>
                            <Input id={`${type}-key-input`} value={newPairState.key} onChange={(e) => setNewPairState({ ...newPairState, key: e.target.value })} placeholder={type === 'env' ? "API_KEY" : "Authorization"} className={`h-9 text-xs`} />
                        </div>
                        <div className="flex-grow">
                            <Label htmlFor={`${type}-value-input`} className="text-xs font-medium text-muted-foreground ml-0.5 mb-1">Value</Label>
                            <Input id={`${type}-value-input`} value={newPairState.value} onChange={(e) => setNewPairState({ ...newPairState, value: e.target.value })} placeholder={type === 'env' ? "s3cr3t_v4lu3" : "Bearer ..."} className={`h-9 text-xs`} />
                        </div>
                        <Button type="button" variant="outline" size="icon" onClick={() => addPair(type)} disabled={!newPairState.key} className="h-9 w-9 mt-auto flex-shrink-0">
                            <Plus size={15} />
                        </Button>
                    </div>
                </AccordionContent>
            </AccordionItem>
        );
    };

    const renderServerForm = () => (
        <div className="space-y-3.5 px-1 py-1">
            <div className="grid gap-1">
                <Label htmlFor="server-name-input" className="text-xs font-medium text-muted-foreground ml-0.5 mb-1">Server Name</Label>
                <Input id="server-name-input" name="name" value={currentServerData.name} onChange={handleInputChange} placeholder="My Awesome MCP Server" className={`h-9 text-sm`}/>
            </div>
            <div className="grid gap-1">
                <Label htmlFor="description-input" className="text-xs font-medium text-muted-foreground ml-0.5 mb-1">Description <span className="text-muted-foreground/70">(Optional)</span></Label>
                <Input id="description-input" name="description" value={currentServerData.description || ''} onChange={handleInputChange} placeholder="Connects to my custom weather API" className={`h-9 text-sm`} />
            </div>
            <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground ml-0.5 mb-1">Transport Type</Label>
                <div className="flex gap-2">
                    <Button 
                        variant={currentServerData.type === 'sse' ? "secondary" : "outline"} 
                        onClick={() => handleTypeChange('sse')}
                        className="flex-1 justify-start text-left h-auto py-1.5 px-2.5 shadow-sm border-input hover:bg-accent hover:text-accent-foreground"
                    >
                        <Globe size={15} className="mr-2 opacity-80" /> 
                        <div>
                            <span className="font-medium text-sm">SSE</span>
                            <p className="text-xs text-muted-foreground font-normal leading-tight">HTTP(S) Stream</p>
                        </div>
                    </Button>
                    <Button 
                        variant={currentServerData.type === 'stdio' ? "secondary" : "outline"} 
                        onClick={() => handleTypeChange('stdio')}
                        className="flex-1 justify-start text-left h-auto py-1.5 px-2.5 shadow-sm border-input hover:bg-accent hover:text-accent-foreground"
                    >
                        <Terminal size={15} className="mr-2 opacity-80" /> 
                         <div>
                            <span className="font-medium text-sm">STDIO</span>
                            <p className="text-xs text-muted-foreground font-normal leading-tight">Local Command</p>
                        </div>
                    </Button>
                </div>
            </div>

            {currentServerData.type === 'sse' && (
                <div className="grid gap-1">
                    <Label htmlFor="url-input" className="text-xs font-medium text-muted-foreground ml-0.5 mb-1">Server URL</Label>
                    <Input id="url-input" name="url" value={currentServerData.url} onChange={handleInputChange} placeholder="https://mcp.example.com/sse" className={`h-9 text-sm`}/>
                </div>
            )}
            {currentServerData.type === 'stdio' && (
                <>
                    <div className="grid gap-1">
                        <Label htmlFor="command-input" className="text-xs font-medium text-muted-foreground ml-0.5 mb-1">Command</Label>
                        <Input id="command-input" name="command" value={currentServerData.command} onChange={handleInputChange} placeholder="python3" className={`h-9 text-sm`}/>
                    </div>
                    <div className="grid gap-1">
                        <Label htmlFor="args-input" className="text-xs font-medium text-muted-foreground ml-0.5 mb-1">Arguments <span className="text-muted-foreground/70">(Optional)</span></Label>
                        <Input id="args-input" name="args" value={(currentServerData.args || []).join(' ')} onChange={handleArgsChange} placeholder='main.py -v or ["main.py", "-v"]' className={`h-9 text-sm`}/>
                        <p className="text-[11px] text-muted-foreground px-1">Space-separated or JSON array.</p>
                    </div>
                </>
            )}
            
            <Accordion type="single" collapsible className="w-full border-t border-b -mx-1 px-1 pt-1 border-border dark:border-input/80">
                 {renderKeyValueFormSection('env')}
                 {currentServerData.type === 'sse' && renderKeyValueFormSection('headers')}
            </Accordion>
        </div>
    );

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) handleDialogClose(); else onOpenChange(o);}}>
            <DialogContent className="sm:max-w-md flex flex-col max-h-[85vh] p-0">
                <DialogHeader className="flex-shrink-0 px-4 pt-4 pb-3 border-b dark:border-input/80">
                    <DialogTitle className="flex items-center gap-1.5 text-md">
                        {view === 'form' ? (editingServer ? "Edit MCP Server" : "Add New MCP Server") : "Manage MCP Servers"}
                    </DialogTitle>
                </DialogHeader>
                
                <div className="flex-grow overflow-y-auto min-h-0 relative px-4 pt-2 pb-1">
                    {view === 'form' ? renderServerForm() : renderServerList()}
                </div>
                
                <DialogFooter className="px-4 pt-3 pb-4 border-t dark:border-input/80 flex-shrink-0">
                    {view === 'list' ? (
                        <Button variant="outline" className="w-full sm:w-auto text-sm h-9" onClick={() => { setEditingServer(null); setView('form'); }}>
                            <Plus size={14} className="mr-1.5"/> Add Server 
                        </Button>
                    ) : ( 
                        <>
                            <Button variant="ghost" className="text-sm h-9" onClick={resetFormAndGoToList}>Cancel</Button>
                            <Button className="text-sm h-9" onClick={handleSaveServer}>
                                {editingServer ? "Save Changes" : "Add Server"}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}; 