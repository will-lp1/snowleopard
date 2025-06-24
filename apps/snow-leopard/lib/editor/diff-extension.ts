import { Mark, mergeAttributes } from '@tiptap/core'

export interface DiffMarkOptions {
  HTMLAttributes: Record<string, any>,
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    diffMark: {
      setInsertion: () => ReturnType,
      setDeletion: () => ReturnType,
      toggleInsertion: () => ReturnType,
      toggleDeletion: () => ReturnType,
      unsetDiff: () => ReturnType,
    }
  }
}

export const Insertion = Mark.create<DiffMarkOptions>({
  name: 'insertion',
  
  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  parseHTML() {
    return [
      {
        tag: 'ins',
        // Support for old diff format
        getAttrs: node => (node as HTMLElement).getAttribute('data-diff-insertion') !== null ? {} : false,
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['ins', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
  },

  addCommands() {
    return {
        setInsertion: () => ({ commands }) => {
            return commands.setMark(this.name)
        },
        toggleInsertion: () => ({ commands }) => {
            return commands.toggleMark(this.name)
        },
        unsetDiff: () => ({ commands }) => {
            return commands.unsetMark(this.name)
        },
    }
  },
})

export const Deletion = Mark.create<DiffMarkOptions>({
    name: 'deletion',
    
    addOptions() {
      return {
        HTMLAttributes: {},
      }
    },
  
    parseHTML() {
      return [
        {
          tag: 'del',
          getAttrs: node => (node as HTMLElement).getAttribute('data-diff-deletion') !== null ? {} : false,
        },
      ]
    },
  
    renderHTML({ HTMLAttributes }) {
      return ['del', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
    },
  
    addCommands() {
      return {
          setDeletion: () => ({ commands }) => {
              return commands.setMark(this.name)
          },
          toggleDeletion: () => ({ commands }) => {
              return commands.toggleMark(this.name)
          },
          unsetDiff: () => ({ commands }) => {
            return commands.unsetMark(this.name)
        },
      }
    },
  }) 