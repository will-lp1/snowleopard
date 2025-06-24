import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, EditorState, Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import { Node as ProseMirrorNode } from 'prosemirror-model';

export const synonymsPluginKey = new PluginKey<SynonymPluginState>('synonymsPlugin');

interface SynonymPluginState {
  decorationSet: DecorationSet;
  loadingPos: { from: number; to: number } | null;
}

function buildDecorations(doc: ProseMirrorNode, loadingPos: { from: number; to: number } | null): DecorationSet {
  const decorations: Decoration[] = [];
  const wordRegex = /\b\w+\b/g;

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = node.text;
    let match: RegExpExecArray | null;
    while ((match = wordRegex.exec(text)) !== null) {
      const start = pos + match.index;
      const end = start + match[0].length;
      const isLoading = loadingPos?.from === start && loadingPos?.to === end;
      decorations.push(
        Decoration.inline(start, end, {
          class: `synonym-word${isLoading ? ' synonym-loading' : ''}`,
          'data-word': match[0],
          'data-from': String(start),
          'data-to': String(end),
        })
      );
    }
  });

  return DecorationSet.create(doc, decorations);
}

function createSynonymPlugin(): Plugin<SynonymPluginState> {
  let overlayContainer: HTMLDivElement | null = null;
  let currentFetchController: AbortController | null = null;
  let closeOverlayListener: ((event: MouseEvent) => void) | null = null;

  function dispatchLoadingState(view: EditorView, loadingPos: { from: number; to: number } | null) {
      view.dispatch(view.state.tr.setMeta(synonymsPluginKey, { loadingPos }));
  }

  function hideOverlay(view?: EditorView) {
    if (closeOverlayListener) {
        document.removeEventListener('mousedown', closeOverlayListener);
        closeOverlayListener = null;
    }
    if (overlayContainer) {
      overlayContainer.remove();
      overlayContainer = null;
    }
    if (view && synonymsPluginKey.getState(view.state)?.loadingPos) {
        dispatchLoadingState(view, null);
    }
  }

  function showOverlay(target: HTMLElement, synonyms: string[], from: number, to: number, view: EditorView) {
    hideOverlay(); 

    overlayContainer = document.createElement('div');
    overlayContainer.className = 'synonym-overlay-menu';
    overlayContainer.style.position = 'absolute';
    overlayContainer.style.zIndex = '1000';
    const rect = target.getBoundingClientRect();
    overlayContainer.style.left = `${rect.left + window.scrollX}px`;
    overlayContainer.style.top = `${rect.bottom + window.scrollY}px`;

    synonyms.forEach(syn => {
      const btn = document.createElement('button');
      btn.textContent = syn;
      btn.className = 'synonym-option';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        view.dispatch(
          view.state.tr
            .replaceWith(from, to, view.state.schema.text(syn))
            .setMeta(synonymsPluginKey, { loadingPos: null }) 
        );
        hideOverlay(); 
        view.focus();
      });
      overlayContainer!.appendChild(btn);
    });

    closeOverlayListener = (event: MouseEvent) => {
        if (overlayContainer && !overlayContainer.contains(event.target as Node)) {
            hideOverlay(view); 
            currentFetchController?.abort();
            currentFetchController = null;
        }
    };
    setTimeout(() => document.addEventListener('mousedown', closeOverlayListener!), 0);

    document.body.appendChild(overlayContainer);
  }

  return new Plugin<SynonymPluginState>({
    key: synonymsPluginKey,
    state: {
      init(_, { doc }): SynonymPluginState {
        return { decorationSet: buildDecorations(doc, null), loadingPos: null };
      },
      apply(tr: Transaction, pluginState: SynonymPluginState, oldState: EditorState, newState: EditorState): SynonymPluginState {
        const meta = tr.getMeta(synonymsPluginKey);
        let nextLoadingPos = pluginState.loadingPos;

        if (meta !== undefined && meta.loadingPos !== undefined) {
          nextLoadingPos = meta.loadingPos;
        }

        if (tr.docChanged && nextLoadingPos) {
            nextLoadingPos = null; 
        }

        if (tr.docChanged || nextLoadingPos !== pluginState.loadingPos) {
          const nextDecorationSet = buildDecorations(newState.doc, nextLoadingPos);
          return { decorationSet: nextDecorationSet, loadingPos: nextLoadingPos };
        }
        
        return pluginState;
      },
    },
    props: {
      decorations(state: EditorState) {
        const pluginState = this.getState(state);
        return pluginState ? pluginState.decorationSet : null;
      },
      handleDOMEvents: {
        mouseover(view, event) {
          const e = event as MouseEvent;
          if (!e.shiftKey) return false; 

          const target = (e.target as HTMLElement).closest('.synonym-word') as HTMLElement;
          if (!target) return false;

          const word = target.getAttribute('data-word');
          const from = Number(target.getAttribute('data-from'));
          const to = Number(target.getAttribute('data-to'));
          const currentState = synonymsPluginKey.getState(view.state);

          if (!word || isNaN(from) || isNaN(to)) return false;

          const context = view.state.doc.textBetween(Math.max(0, from - 50), Math.min(view.state.doc.content.size, to + 50));

          if (currentState?.loadingPos?.from === from && currentState.loadingPos.to === to) {
            return false;
          }

          currentFetchController?.abort();
          const controller = new AbortController();
          currentFetchController = controller;

          dispatchLoadingState(view, { from, to });
          hideOverlay(); 

          fetch(`/api/synonyms`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({ word, context })
          })
            .then(res => {
              if (!res.ok) throw new Error(`API Error ${res.status}`);
              return res.json();
            })
            .then(data => {
              const latestState = synonymsPluginKey.getState(view.state);
              if (controller.signal.aborted) return;
              if (latestState?.loadingPos?.from === from && latestState.loadingPos.to === to) {
                  if (data.synonyms?.length > 0) {
                      showOverlay(target, data.synonyms, from, to, view);
                  } else {
                      dispatchLoadingState(view, null); 
                  }
              }
            })
            .catch(err => {
              if (err.name !== 'AbortError') {
                  const latestState = synonymsPluginKey.getState(view.state);
                  if (latestState?.loadingPos?.from === from && latestState.loadingPos.to === to) {
                    dispatchLoadingState(view, null);
                  }
              }
            });
            
          return false;
        },
      },
    },
    view() {
      return {
        destroy() {
            hideOverlay();
            currentFetchController?.abort();
        }
      }
    }
  });
}

export const Synonym = Extension.create({
  name: 'synonym',

  addProseMirrorPlugins() {
    return [createSynonymPlugin()];
  },
}); 