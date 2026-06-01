"use client"

/**
 * components/RunFileTree.tsx
 *
 * Read-only file tree panel for the run workspace.
 * This gives users an IDE-like structure view while the agent executes.
 */

import { useEffect, useState } from "react"
import {
  AlertCircleIcon,
  BracesIcon,
  ChevronRightIcon,
  Code2Icon,
  FileCodeIcon,
  FileIcon,
  FileTextIcon,
  FileWarningIcon,
  FolderIcon,
  FolderOpenIcon,
  Loader2Icon,
  PaletteIcon,
} from "lucide-react"
import type { RepoFileContent, RepoTreeNode } from "@/types"

type FileKind = "folder" | "ts" | "tsx" | "css" | "json" | "md" | "other"

interface RunFileTreeProps {
  repoFullName: string
  /** Optional Git ref, usually the pushed agent branch after a run completes. */
  refName?: string
}

/** Finds the first file in the sorted tree so IDE mode can open something useful. */
function findFirstFilePath(node: RepoTreeNode): string {
  if (node.type === "file") return node.path

  for (const child of node.children ?? []) {
    const childPath = findFirstFilePath(child)
    if (childPath) return childPath
  }

  return ""
}

/** Collects folder paths so the explorer can show the fetched tree immediately. */
function collectFolderPaths(node: RepoTreeNode): string[] {
  if (node.type !== "folder") return []

  return [
    node.path,
    ...(node.children ?? []).flatMap((child) => collectFolderPaths(child)),
  ]
}

/** Infers file icon type from a filename. */
function getFileType(fileName: string): FileKind {
  if (fileName.endsWith(".tsx")) return "tsx"
  if (fileName.endsWith(".ts")) return "ts"
  if (fileName.endsWith(".css")) return "css"
  if (fileName.endsWith(".json")) return "json"
  if (fileName.endsWith(".md")) return "md"
  return "other"
}

function getFileIcon(type: FileKind, isExpanded?: boolean) {
  if (!type || type === "folder") {
    return isExpanded ? (
      <FolderOpenIcon className="size-4 text-amber-500" />
    ) : (
      <FolderIcon className="size-4 text-amber-500" />
    )
  }
  if (type === "tsx" || type === "ts") return <FileCodeIcon className="size-4 text-blue-500" />
  if (type === "css") return <PaletteIcon className="size-4 text-purple-500" />
  if (type === "json") return <BracesIcon className="size-4 text-yellow-500" />
  if (type === "md") return <FileTextIcon className="size-4 text-gray-400" />
  return <FileIcon className="size-4 text-gray-400" />
}

/** Formats byte counts for the editor metadata bar. */
function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function RunFileTree({ repoFullName, refName }: RunFileTreeProps) {
  const [treeData, setTreeData] = useState<RepoTreeNode | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedFilePath, setSelectedFilePath] = useState("")
  const [expandedFolderPaths, setExpandedFolderPaths] = useState<Set<string>>(
    () => new Set([""])
  )
  const [fileContent, setFileContent] = useState<RepoFileContent | null>(null)
  const [fileLoading, setFileLoading] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)

  /** Fetch the selected repository tree using the user's authenticated session. */
  useEffect(() => {
    const controller = new AbortController()

    async function fetchTree() {
      setLoading(true)
      setError(null)

      try {
        setSelectedFilePath("")
        setFileContent(null)
        setFileError(null)
        setExpandedFolderPaths(new Set([""]))

        const [owner, repo] = repoFullName.split("/")
        const query = refName ? `?ref=${encodeURIComponent(refName)}` : ""
        const res = await fetch(
          `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tree${query}`,
          { signal: controller.signal }
        )
        const data = (await res.json()) as RepoTreeNode | { error?: string }

        if (!res.ok) {
          throw new Error("error" in data ? data.error : "Failed to fetch repo tree")
        }

        const repoTree = data as RepoTreeNode
        setTreeData(repoTree)
        setExpandedFolderPaths(new Set(collectFolderPaths(repoTree)))
        setSelectedFilePath(findFirstFilePath(repoTree))
      } catch (err: unknown) {
        if ((err as { name?: string }).name === "AbortError") return
        setError(err instanceof Error ? err.message : "Failed to fetch repo tree")
      } finally {
        setLoading(false)
      }
    }

    fetchTree()
    return () => controller.abort()
  }, [repoFullName, refName])

  /** Fetch file content when the selected file changes. */
  useEffect(() => {
    if (!selectedFilePath) return

    const controller = new AbortController()

    async function fetchFileContent() {
      setFileLoading(true)
      setFileError(null)

      try {
        const [owner, repo] = repoFullName.split("/")
        const params = new URLSearchParams({ path: selectedFilePath })
        if (refName) params.set("ref", refName)
        const res = await fetch(
          `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/content?${params.toString()}`,
          { signal: controller.signal }
        )
        const data = (await res.json()) as RepoFileContent | { error?: string }

        if (!res.ok) {
          throw new Error("error" in data ? data.error : "Failed to fetch file")
        }

        setFileContent(data as RepoFileContent)
      } catch (err: unknown) {
        if ((err as { name?: string }).name === "AbortError") return
        setFileContent(null)
        setFileError(err instanceof Error ? err.message : "Failed to fetch file")
      } finally {
        setFileLoading(false)
      }
    }

    fetchFileContent()
    return () => controller.abort()
  }, [repoFullName, selectedFilePath, refName])

  /** Expands or collapses one folder path in the explorer. */
  const toggleFolder = (path: string) => {
    setExpandedFolderPaths((current) => {
      const next = new Set(current)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  /** Renders repository nodes directly so every API child appears in the explorer. */
  const renderTreeNode = (node: RepoTreeNode, depth: number) => {
    const isFolder = node.type === "folder"
    const isExpanded = expandedFolderPaths.has(node.path)
    const fileKind = isFolder ? "folder" : getFileType(node.name)
    const isSelectedFile = !isFolder && node.path === selectedFilePath

    return (
      <div key={node.id || node.path || "root"}>
        <button
          type="button"
          aria-label={
            isFolder ? `Toggle ${node.name}` : `Open ${node.path}`
          }
          onClick={() => {
            if (isFolder) {
              toggleFolder(node.path)
            } else {
              setSelectedFilePath(node.path)
            }
          }}
          className={`flex w-full min-w-0 items-center gap-1.5 rounded px-2 py-1 text-left font-mono text-xs transition-colors hover:bg-[#1a1a1a] ${
            isSelectedFile ? "bg-[#00ff87]/10 text-[#00ff87]" : "text-gray-300"
          }`}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
        >
          {isFolder ? (
            <ChevronRightIcon
              className={`size-3 shrink-0 text-[#6e6e6e] transition-transform ${
                isExpanded ? "rotate-90" : ""
              }`}
            />
          ) : (
            <span className="w-3 shrink-0" />
          )}
          {getFileIcon(fileKind, isExpanded)}
          <span className="truncate">{node.name}</span>
        </button>

        {isFolder && isExpanded && (
          <div>
            {(node.children ?? []).map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="h-full rounded-lg border border-[#1e1e1e] bg-[#0f0f0f] p-4">
        <div className="flex items-center gap-2 text-xs font-mono text-[#6e6e6e]">
          <Loader2Icon className="size-4 animate-spin text-[#00ff87]" />
          Loading repository tree…
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full rounded-lg border border-red-500/30 bg-red-950/10 p-4">
        <div className="flex items-start gap-2 text-xs font-mono text-red-300">
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      </div>
    )
  }

  if (!treeData) {
    return (
      <div className="h-full rounded-lg border border-[#1e1e1e] bg-[#0f0f0f] p-4">
        <p className="text-xs font-mono text-[#6e6e6e]">
          This repository does not contain files on the default branch.
        </p>
      </div>
    )
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 overflow-hidden rounded-lg border border-[#1e1e1e] bg-[#0f0f0f] lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-b border-[#1e1e1e] bg-[#101010] lg:border-b-0 lg:border-r">
        <div className="border-b border-[#1e1e1e] px-3 py-2">
          <p className="text-xs font-mono text-[#6e6e6e] uppercase tracking-wider">
            Explorer
          </p>
          <p className="mt-1 truncate text-[11px] font-mono text-[#4e4e4e]">
            {refName ? `Viewing ${refName}` : "Viewing default branch"}
          </p>
        </div>
        <div
          data-scroll-region="file-tree"
          className="min-h-0 flex-1 overscroll-contain overflow-auto p-2"
        >
          {(treeData.children ?? []).map((child) => renderTreeNode(child, 0))}
        </div>
      </aside>

      <section className="flex min-h-0 flex-col bg-[#0b0b0b]">
        <div className="flex items-center justify-between gap-3 border-b border-[#1e1e1e] px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Code2Icon className="size-4 shrink-0 text-[#00ff87]" />
            <span className="truncate font-mono text-xs text-gray-300">
              {selectedFilePath || "Select a file"}
            </span>
          </div>
          {fileContent && !fileContent.isBinary && (
            <span className="shrink-0 font-mono text-[11px] text-[#6e6e6e]">
              {fileContent.content.split("\n").length} lines · {formatBytes(fileContent.size)}
            </span>
          )}
        </div>

        <div
          data-scroll-region="file-content"
          className="min-h-0 flex-1 overscroll-contain overflow-auto"
        >
          {fileLoading ? (
            <div className="flex h-full items-center justify-center gap-2 font-mono text-xs text-[#6e6e6e]">
              <Loader2Icon className="size-4 animate-spin text-[#00ff87]" />
              Loading file…
            </div>
          ) : fileError ? (
            <div className="m-4 rounded-md border border-red-500/30 bg-red-950/10 p-4">
              <div className="flex items-start gap-2 text-xs font-mono text-red-300">
                <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
                <span>{fileError}</span>
              </div>
            </div>
          ) : fileContent?.isBinary ? (
            <div className="m-4 rounded-md border border-amber-500/30 bg-amber-950/10 p-4">
              <div className="flex items-start gap-2 text-xs font-mono text-amber-300">
                <FileWarningIcon className="mt-0.5 size-4 shrink-0" />
                <span>Binary files cannot be previewed as text.</span>
              </div>
            </div>
          ) : fileContent ? (
            <pre className="min-w-max p-4 font-mono text-xs leading-5 text-gray-300">
              {fileContent.content.split("\n").map((line, index) => (
                <div key={`${fileContent.path}-${index}`} className="flex">
                  <span className="mr-4 w-10 shrink-0 select-none text-right text-[#3e3e3e]">
                    {index + 1}
                  </span>
                  <code className="whitespace-pre">{line || "\u00A0"}</code>
                </div>
              ))}
            </pre>
          ) : (
            <div className="flex h-full items-center justify-center font-mono text-xs text-[#4e4e4e]">
              Select a file from the explorer to preview its content.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
