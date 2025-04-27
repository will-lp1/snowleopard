import { Plugin, PluginKey, Transaction, EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Node } from 'prosemirror-model';
import { buildContentFromDocument } from './functions'; // Assuming functions.tsx exports this

export const savePluginKey = new PluginKey<SaveState>('save');

export type SaveStatus = 'idle' | 'debouncing' | 'saving' | 'error' | 'saved';

export interface SaveState {
  status: SaveStatus;
  lastSaved: Date | null;
  errorMessage: string | null;
  isDirty: boolean;
  createDocument?: boolean;
  initialContent?: string;
  triggerSave?: boolean;
}

interface SavePluginOptions {
  saveFunction: (content: string) => Promise<{ updatedAt: string | Date } | null>; 
  debounceMs?: number;
  initialLastSaved?: Date | null;
  documentId: string; 
}

export function savePlugin({
  saveFunction,
  debounceMs = 1500,
  initialLastSaved = null,
  documentId,
}: SavePluginOptions): Plugin<SaveState> {
  let debounceTimeout: NodeJS.Timeout | null = null;
  let inflightRequest: Promise<any> | null = null;
  let editorViewInstance: EditorView | null = null;

  return new Plugin<SaveState>({
    key: savePluginKey,
    state: {
      init(_, state): SaveState {
        return {
          status: 'idle',
          lastSaved: initialLastSaved,
          errorMessage: null,
          isDirty: false,
          createDocument: false,
          initialContent: '',
        };
      },
      apply(tr, pluginState, oldState, newState): SaveState {
        const meta = tr.getMeta(savePluginKey);
        let shouldTriggerSave = false;
        if (meta) {
          if (meta.triggerSave === true) {
            shouldTriggerSave = true;
            meta.triggerSave = false; 
          }
          if (meta.createDocument === false) {
            return { ...pluginState, ...meta, initialContent: '' };
          }
          pluginState = { ...pluginState, ...meta };
        }

        if (!tr.docChanged && !shouldTriggerSave) {
          return pluginState;
        }

        if (shouldTriggerSave) {
          console.log('[SavePlugin] Explicit save triggered via meta.');
        }

        const wasEmpty = oldState.doc.content.size <= 2;
        if (documentId === 'init' && tr.docChanged && wasEmpty && newState.doc.textContent.trim().length > 0) {
          console.log('[SavePlugin] Initial input detected for "init" document. Triggering creation.');
          return {
            ...pluginState,
            status: 'idle',
            isDirty: false,
            createDocument: true,
            initialContent: newState.doc.textContent,
            errorMessage: null,
          };
        }
        
        if (debounceTimeout) {
          clearTimeout(debounceTimeout);
        }
        
        let newStatus: SaveStatus = 'debouncing';
        
        if (pluginState.status === 'saving' && inflightRequest) {
            console.log('[SavePlugin] Doc changed/triggered while saving, keeping saving status.');
            newStatus = 'saving';
        } else {
             pluginState = { ...pluginState, errorMessage: null };
        }

        const docActuallyChanged = tr.docChanged;

        debounceTimeout = setTimeout(() => {
          if (!editorViewInstance) {
              console.warn('[SavePlugin] Debounce fired, but editor view is not available.');
              return;
          }
          const view = editorViewInstance;
          const currentState = savePluginKey.getState(view.state);
          
          if (!currentState || currentState.status !== 'debouncing') {
             console.log(`[SavePlugin] Debounce fired, but state is invalid or status is not debouncing (${currentState?.status}). Skipping save.`);
             return;
          }

          if (inflightRequest) {
            console.warn('[SavePlugin] Debounce fired, but another save is already in progress.');
            return; 
          }

          console.log('[SavePlugin] Debounce finished, triggering save.');
          
          setSaveStatus(view, { status: 'saving', isDirty: false });
          
          const contentToSave = buildContentFromDocument(view.state.doc);

          inflightRequest = saveFunction(contentToSave)
            .then(result => {
              inflightRequest = null;
              console.log('[SavePlugin] Save successful.');
              setSaveStatus(view, { 
                  status: 'saved',
                  lastSaved: result?.updatedAt ? new Date(result.updatedAt) : new Date(),
                  errorMessage: null,
                  isDirty: false
              });
            })
            .catch(error => {
               inflightRequest = null;
              console.error('[SavePlugin] Save failed:', error);
              setSaveStatus(view, { 
                  status: 'error',
                  errorMessage: error instanceof Error ? error.message : 'Unknown save error',
                  isDirty: true
              });
            });

        }, debounceMs);

        return {
          ...pluginState,
          status: newStatus,
          isDirty: pluginState.isDirty || docActuallyChanged,
        };
      },
    },
    view(editorView) {
       editorViewInstance = editorView;
       console.log(`[SavePlugin] View created for documentId: ${documentId}`);
       return {
         destroy() {
           editorViewInstance = null;
           if (debounceTimeout) {
             clearTimeout(debounceTimeout);
           }
         }
       };
    }
  });
}

export function setSaveStatus(view: EditorView, statusUpdate: Partial<SaveState>) {
  const update = statusUpdate.createDocument === false 
                 ? { ...statusUpdate, initialContent: '' } 
                 : statusUpdate;
  view.dispatch(view.state.tr.setMeta(savePluginKey, update));
} 