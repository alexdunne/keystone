/** @jsx jsx */

import { jsx, useTheme } from '@keystone-ui/core';
import { Fragment, KeyboardEvent, useState } from 'react';
import isHotkey from 'is-hotkey';
import { useCallback, useMemo } from 'react';
import { Editor, Node, Range, Transforms, createEditor, NodeEntry, Element } from 'slate';
import { Editable, ReactEditor, RenderLeafProps, Slate, withReact } from 'slate-react';
import { withHistory } from 'slate-history';

import { withPanel } from './panel';
import { withParagraphs } from './paragraphs';
import { withQuote } from './quote';
import { withLink } from './link';

import { ColumnOptionsProvider, withColumns } from './columns';

import { Mark, toggleMark } from './utils';
import { Toolbar } from './Toolbar';
import { renderElement } from './render-element';
import { withHeading } from './heading';
import { isListType, withList } from './lists';
import {
  ComponentBlockProvider,
  getPlaceholderTextForPropPath,
  VOID_BUT_NOT_REALLY_COMPONENT_INLINE_PROP,
  withComponentBlocks,
} from './component-blocks';
import { withBlockquote } from './blockquote';
import { ComponentBlock } from '../component-blocks';
import {
  DocumentFieldRelationshipsProvider,
  Relationships,
  withRelationship,
} from './relationship';
import { DocumentFeatures } from '../views';
import { withDivider } from './divider';
import { withCodeBlock } from './code-block';

const HOTKEYS: Record<string, Mark> = {
  'mod+b': 'bold',
  'mod+i': 'italic',
  'mod+u': 'underline',
};

const getKeyDownHandler = (editor: ReactEditor) => (event: KeyboardEvent) => {
  for (const hotkey in HOTKEYS) {
    if (isHotkey(hotkey, event.nativeEvent)) {
      event.preventDefault();
      toggleMark(editor, HOTKEYS[hotkey]);
    }
  }
  if (event.key === 'Tab' && editor.selection && Range.isCollapsed(editor.selection)) {
    const block = Editor.above(editor, {
      match: n => Editor.isBlock(editor, n),
    });

    if (block && block[0].type === 'list-item') {
      event.preventDefault();
      if (event.shiftKey) {
        Transforms.unwrapNodes(editor, {
          match: node => isListType(node.type as string),
          split: true,
        });
      } else {
        const type = Editor.parent(editor, block[1])[0].type as string;
        Transforms.wrapNodes(editor, {
          type,
          children: [],
        });
      }
    }
  }
};

/* Leaf Elements */

const Leaf = ({ leaf, children, attributes }: RenderLeafProps) => {
  const { colors, radii, spacing, typography } = useTheme();
  const {
    underline,
    strikethrough,
    bold,
    italic,
    code,
    keyboard,
    superscript,
    subscript,
    placeholder,
  } = leaf;
  if (placeholder !== undefined) {
    children = (
      <Fragment>
        <span
          contentEditable={false}
          style={{
            pointerEvents: 'none',
            display: 'inline-block',
            width: '0',
            maxWidth: '100%',
            whiteSpace: 'nowrap',
            opacity: '0.333',
            userSelect: 'none',
            fontStyle: 'normal',
            fontWeight: 'normal',
            textDecoration: 'none',
          }}
        >
          {placeholder as string}
        </span>
        {children}
      </Fragment>
    );
  }
  if (code) {
    children = (
      <code
        css={{
          backgroundColor: colors.backgroundDim,
          borderRadius: radii.xsmall,
          display: 'inline-block',
          fontFamily: typography.fontFamily.monospace,
          fontSize: typography.fontSize.small,
          padding: `0 ${spacing.xxsmall}px`,
        }}
      >
        {children}
      </code>
    );
  }
  if (bold) {
    children = <strong>{children}</strong>;
  }
  if (strikethrough) {
    children = <s>{children}</s>;
  }
  if (italic) {
    children = <em>{children}</em>;
  }
  if (keyboard) {
    children = <kbd>{children}</kbd>;
  }
  if (superscript) {
    children = <sup>{children}</sup>;
  }
  if (subscript) {
    children = <sub>{children}</sub>;
  }
  return (
    <span
      {...attributes}
      style={{
        textDecoration: underline ? 'underline' : undefined,
      }}
    >
      {children}
    </span>
  );
};

export function DocumentEditor({
  autoFocus,
  onChange,
  value,
  componentBlocks,
  relationships,
  documentFeatures,
}: {
  autoFocus?: boolean;
  onChange: undefined | ((value: Node[]) => void);
  value: Node[];
  componentBlocks: Record<string, ComponentBlock>;
  relationships: Relationships;
  documentFeatures: DocumentFeatures;
}) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const editor = useMemo(
    () =>
      withList(
        documentFeatures.listTypes,
        withHeading(
          documentFeatures.headingLevels,
          withRelationship(
            relationships,
            withComponentBlocks(
              componentBlocks,
              withParagraphs(
                withDivider(
                  documentFeatures.dividers,
                  withColumns(
                    withCodeBlock(
                      documentFeatures.blockTypes.code,
                      withBlockquote(
                        documentFeatures.blockTypes.blockquote,
                        withLink(withQuote(withPanel(withHistory(withReact(createEditor())))))
                      )
                    )
                  )
                )
              )
            )
          )
        )
      ),
    []
  );

  const renderLeaf = useCallback(props => {
    return <Leaf {...props} />;
  }, []);

  const onKeyDown = useMemo(() => getKeyDownHandler(editor), [editor]);

  useMemo(() => {
    findDuplicateNodes(value);
  }, [value]);

  return (
    <div
      css={
        expanded && {
          background: colors.background,
          bottom: 0,
          left: 0,
          overflowY: 'auto', // required to keep the toolbar stuck in place
          position: 'absolute',
          right: 0,
          top: 0,
          zIndex: 100,
        }
      }
    >
      <DocumentFieldRelationshipsProvider value={relationships}>
        <ColumnOptionsProvider value={documentFeatures.columns}>
          <ComponentBlockProvider value={componentBlocks}>
            <Slate
              editor={editor}
              value={value}
              onChange={value => {
                onChange?.(value);
              }}
            >
              <Toolbar
                documentFeatures={documentFeatures}
                viewState={useMemo(
                  () => ({
                    expanded,
                    toggle: () => {
                      setExpanded(v => !v);
                    },
                  }),
                  [expanded]
                )}
              />
              <Editable
                decorate={useCallback(
                  ([node, path]: NodeEntry<Node>) => {
                    let decorations: Range[] = [];
                    if (node.type === 'component-block' && Element.isElement(node)) {
                      if (
                        node.children.length === 1 &&
                        (node.children[0].propPath as any).length === 1 &&
                        (node.children[0].propPath as any)[0] ===
                          VOID_BUT_NOT_REALLY_COMPONENT_INLINE_PROP
                      ) {
                        return decorations;
                      }
                      node.children.forEach((child, index) => {
                        if (Node.string(child) === '') {
                          const start = Editor.start(editor, [...path, index]);
                          const placeholder = getPlaceholderTextForPropPath(
                            child.propPath as any,
                            componentBlocks[node.component as string].props,
                            node.props as any
                          );

                          decorations.push({
                            placeholder,
                            anchor: start,
                            focus: start,
                          });
                        }
                      });
                    }

                    return decorations;
                  },
                  [editor]
                )}
                css={styles}
                autoFocus={autoFocus}
                onKeyDown={onKeyDown}
                readOnly={onChange === undefined}
                renderElement={renderElement}
                renderLeaf={renderLeaf}
              />
            </Slate>

            {
              // for debugging
              true && <pre>{JSON.stringify(value, null, 2)}</pre>
            }
          </ComponentBlockProvider>
        </ColumnOptionsProvider>
      </DocumentFieldRelationshipsProvider>
    </div>
  );
}

const orderedListStyles = ['lower-roman', 'decimal', 'lower-alpha'];
const unorderedListStyles = ['square', 'disc', 'circle'];

let styles: any = {};

let listDepth = 10;

while (listDepth--) {
  let arr = Array.from({ length: listDepth });
  styles[arr.map(() => `ol`).join(' ')] = {
    listStyle: orderedListStyles[listDepth % 3],
  };
  styles[arr.map(() => `ul`).join(' ')] = {
    listStyle: unorderedListStyles[listDepth % 3],
  };
}

/**
 * Slate freaks out(which is quite expected ofc) if the
 * same nodes(as in ===, same shape is fine) are in the tree
 * multiple times so we'll validate it here to avoid running into it
 * strange and hard to debug problems
 */
function findDuplicateNodes(nodes: Node[], found: WeakSet<object> = new WeakSet()) {
  for (const node of nodes) {
    if (found.has(node)) {
      throw new Error('Duplicate node found: ' + JSON.stringify(node));
    }
    found.add(node);
    if (Array.isArray(node.children)) {
      findDuplicateNodes(node.children, found);
    }
  }
}