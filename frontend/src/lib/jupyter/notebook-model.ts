import type { CellOutput, CellType, NotebookCell, NotebookContent } from "./types";

function normalizeSource(source: string): string {
  return source.replace(/\r\n/g, "\n");
}

export const DEFAULT_NOTEBOOK_STARTER_CODE = `# CollabClone Python environment includes common analytics libraries
# You can run this cell with Shift+Enter

import numpy as np  # linear algebra
import pandas as pd  # data processing (e.g. pd.read_csv)

# Example: list files in your mounted input directory
import os
for dirname, _, filenames in os.walk("/workspace/input"):
    for filename in filenames:
        print(os.path.join(dirname, filename))

# You can write outputs to your working directory for this session
`;

export function createCell(type: CellType, source = ""): NotebookCell {
  const normalizedSource = normalizeSource(source);

  return {
    id: crypto.randomUUID(),
    cell_type: type,
    source: normalizedSource,
    metadata: {},
    outputs: [],
    execution_count: null
  };
}

export function createNewNotebook(): NotebookContent {
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: {
        display_name: "Python 3",
        language: "python",
        name: "python3"
      },
      language_info: {
        name: "python",
        version: "3.11"
      }
    },
    cells: [createCell("code", DEFAULT_NOTEBOOK_STARTER_CODE)]
  };
}

export function insertCell(notebook: NotebookContent, afterIndex: number, cell: NotebookCell): NotebookContent {
  const nextCells = [...notebook.cells];
  const insertAt = Math.max(0, Math.min(afterIndex + 1, nextCells.length));
  nextCells.splice(insertAt, 0, cell);

  return {
    ...notebook,
    cells: nextCells
  };
}

export function deleteCell(notebook: NotebookContent, cellId: string): NotebookContent {
  if (notebook.cells.length <= 1) {
    return notebook;
  }

  const nextCells = notebook.cells.filter((cell) => cell.id !== cellId);
  if (nextCells.length === notebook.cells.length) {
    return notebook;
  }

  return {
    ...notebook,
    cells: nextCells
  };
}

export function updateCellSource(notebook: NotebookContent, cellId: string, source: string): NotebookContent {
  const normalizedSource = normalizeSource(source);

  return {
    ...notebook,
    cells: notebook.cells.map((cell) => {
      if (cell.id !== cellId) {
        return cell;
      }

      return {
        ...cell,
        source: normalizedSource
      };
    })
  };
}

export function updateCellOutputs(notebook: NotebookContent, cellId: string, outputs: CellOutput[]): NotebookContent {
  return {
    ...notebook,
    cells: notebook.cells.map((cell) => {
      if (cell.id !== cellId) {
        return cell;
      }

      return {
        ...cell,
        outputs
      };
    })
  };
}

export function clearCellOutputs(notebook: NotebookContent, cellId: string): NotebookContent {
  return {
    ...notebook,
    cells: notebook.cells.map((cell) => {
      if (cell.id !== cellId) {
        return cell;
      }

      return {
        ...cell,
        outputs: [],
        execution_count: null
      };
    })
  };
}

export function clearAllOutputs(notebook: NotebookContent): NotebookContent {
  return {
    ...notebook,
    cells: notebook.cells.map((cell) => {
      if (cell.cell_type !== "code") {
        return cell;
      }

      return {
        ...cell,
        outputs: [],
        execution_count: null
      };
    })
  };
}

export function moveCellUp(notebook: NotebookContent, cellId: string): NotebookContent {
  const index = notebook.cells.findIndex((cell) => cell.id === cellId);
  if (index <= 0) {
    return notebook;
  }

  const nextCells = [...notebook.cells];
  const [cell] = nextCells.splice(index, 1);
  nextCells.splice(index - 1, 0, cell);

  return {
    ...notebook,
    cells: nextCells
  };
}

export function moveCellDown(notebook: NotebookContent, cellId: string): NotebookContent {
  const index = notebook.cells.findIndex((cell) => cell.id === cellId);
  if (index < 0 || index >= notebook.cells.length - 1) {
    return notebook;
  }

  const nextCells = [...notebook.cells];
  const [cell] = nextCells.splice(index, 1);
  nextCells.splice(index + 1, 0, cell);

  return {
    ...notebook,
    cells: nextCells
  };
}

export function serializeToSave(notebook: NotebookContent): NotebookContent {
  return {
    ...notebook,
    cells: notebook.cells.map((cell) => ({
      ...cell,
      id: cell.id && cell.id.trim().length > 0 ? cell.id : crypto.randomUUID(),
      source: normalizeSource(cell.source).trim()
    }))
  };
}
