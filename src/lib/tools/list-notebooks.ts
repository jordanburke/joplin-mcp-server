import type { JoplinFolder } from "./base-tool.js"
import BaseTool, { ToolError } from "./base-tool.js"

class ListNotebooks extends BaseTool {
  async call(): Promise<string> {
    try {
      const notebooks = this.unwrap(
        await this.apiClient.getAllItems<JoplinFolder>("/folders", {
          query: { fields: "id,title,parent_id" },
        }),
      )

      const notebooksByParentId = notebooks.reduce<Record<string, JoplinFolder[]>>((acc, notebook) => {
        const parentId = notebook.parent_id ?? ""
        return { ...acc, [parentId]: [...(acc[parentId] ?? []), notebook] }
      }, {})

      // Add a header with instructions
      const resultLines = [
        "Joplin Notebooks:\n",
        "NOTE: To read a notebook, use the notebook_id with the read_notebook command\n",
        'Example: read_notebook notebook_id="your-notebook-id"\n\n',
      ]

      // Add the notebook hierarchy
      resultLines.push(
        ...this.notebooksLines(notebooksByParentId[""] ?? [], {
          indent: 0,
          notebooksByParentId,
        }),
      )

      return resultLines.join("")
    } catch (error: unknown) {
      if (error instanceof ToolError) throw error
      process.stderr.write(`listing notebooks error: ${error}\n`)
      const message = error instanceof Error ? error.message : "Unknown error"
      throw new ToolError(`Failed to list notebooks: ${message}`)
    }
  }

  private notebooksLines(
    notebooks: JoplinFolder[],
    {
      indent = 0,
      notebooksByParentId,
    }: {
      indent: number
      notebooksByParentId: Record<string, JoplinFolder[]>
    },
  ): string[] {
    const indentSpaces = " ".repeat(indent)

    return this.sortNotebooks(notebooks).flatMap((notebook) => {
      const { id } = notebook
      const childNotebooks = notebooksByParentId[id]
      return [
        `${indentSpaces}Notebook: "${notebook.title}" (notebook_id: "${id}")\n`,
        ...(childNotebooks ? this.notebooksLines(childNotebooks, { indent: indent + 2, notebooksByParentId }) : []),
      ]
    })
  }

  private sortNotebooks(notebooks: JoplinFolder[]): JoplinFolder[] {
    // Ensure that notebooks starting with '[0]' are sorted first
    const CHARACTER_BEFORE_A = String.fromCharCode("A".charCodeAt(0) - 1)
    return [...notebooks].sort((a, b) => {
      const titleA = a.title.replace("[", CHARACTER_BEFORE_A)
      const titleB = b.title.replace("[", CHARACTER_BEFORE_A)
      return titleA.localeCompare(titleB)
    })
  }
}

export default ListNotebooks
