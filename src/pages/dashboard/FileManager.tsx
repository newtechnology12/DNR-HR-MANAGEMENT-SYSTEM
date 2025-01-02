import React, { useState, useEffect, useCallback } from "react";
import { GoogleOAuthProvider, useGoogleLogin } from "@react-oauth/google";
import DataTable from "@/components/DataTable";
import { ColumnDef, PaginationState } from "@tanstack/react-table";
import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader";
import { Checkbox } from "@/components/ui/checkbox";
import {
  PlusCircle,
  Folder,
  FileText,
  Share2,
  Download,
  ArrowLeft,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "react-query";
import { Button } from "@/components/ui/button";
import useModalState from "@/hooks/useModalState";
import DataTableRowActions from "@/components/datatable/DataTableRowActions";
import ConfirmModal from "@/components/modals/ConfirmModal";
import useConfirmModal from "@/hooks/useConfirmModal";
import { toast } from "sonner";
import BreadCrumb from "@/components/breadcrumb";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;

function FileManagerContent() {
  const [accessToken, setAccessToken] = useState(null);
  const [gapi, setGapi] = useState(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [fileToUpload, setFileToUpload] = useState(null);
  const [currentFolderId, setCurrentFolderId] = useState("root");
  const [folderHistory, setFolderHistory] = useState(["root"]);

  const login = useGoogleLogin({
    onSuccess: (response) => setAccessToken(response.access_token),
    scope: "https://www.googleapis.com/auth/drive.file",
  });

  const initializeGapi = useCallback(async () => {
    if (!window.gapi) return;

    await window.gapi.client.init({
      apiKey: API_KEY,
      discoveryDocs: [
        "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
      ],
    });

    setGapi(window.gapi);
  }, []);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.onload = () => {
      window.gapi.load("client", initializeGapi);
    };
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, [initializeGapi]);

  useEffect(() => {
    if (gapi && accessToken) {
      gapi.client.setToken({ access_token: accessToken });
    }
  }, [gapi, accessToken]);

  const columns: ColumnDef<any>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
          className="translate-y-[2px]"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
          className="translate-y-[2px]"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {row.original.mimeType === "application/vnd.google-apps.folder" ? (
            <Folder size={16} />
          ) : (
            <FileText size={16} />
          )}
          <Link
            to="#"
            onClick={() =>
              row.original.mimeType === "application/vnd.google-apps.folder"
                ? handleFolderClick(row.original.id)
                : handleOpenFile(row.original)
            }
            className="hover:underline flex items-center gap-2 capitalize hover:text-slate-600"
          >
            {row.getValue("name")}
          </Link>
        </div>
      ),
      enableSorting: true,
      enableHiding: true,
    },
    {
      accessorKey: "modifiedTime",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Modified" />
      ),
      cell: ({ row }) => (
        <div>{new Date(row.getValue("modifiedTime")).toLocaleString()}</div>
      ),
      enableSorting: true,
      enableHiding: true,
    },
    {
      id: "actions",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Actions" />
      ),
      cell: ({ row }) => (
        <DataTableRowActions
          actions={[
            {
              title: "Share",
              onClick: () => handleShare(row.original.id),
              icon: <Share2 size={16} />,
            },
            {
              title: "Delete",
              onClick: () => {
                confirmModal.open({ meta: row.original });
              },
            },
            {
              title: "Download",
              onClick: () => handleDownload(row.original.id),
              icon: <Download size={16} />,
            },
          ]}
          row={row}
        />
      ),
    },
  ];

  const [searchText, setSearchText] = useState("");
  const [columnFilters, setColumnFilters] = useState([]);
  const [sorting, setSorting] = useState([{ id: "modifiedTime", desc: true }]);
  const [{ pageIndex, pageSize }, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  const filesQuery = useQuery({
    queryKey: [
      "files",
      {
        columnFilters,
        search: searchText,
        sort: sorting,
        pageIndex,
        pageSize,
        currentFolderId,
      },
    ],
    queryFn: async () => {
      if (!accessToken || !gapi) return { files: [], nextPageToken: null };

      const response = await gapi.client.drive.files.list({
        pageSize: pageSize,
        fields: "nextPageToken, files(id, name, mimeType, modifiedTime)",
        q: `'${currentFolderId}' in parents and trashed = false`,
        orderBy: sorting
          .map((s) => `${s.id} ${s.desc ? "desc" : "asc"}`)
          .join(", "),
        pageToken: pageIndex > 0 ? filesQuery.data?.nextPageToken : null,
      });

      return {
        files: response.result.files,
        nextPageToken: response.result.nextPageToken,
      };
    },
    enabled: !!accessToken && !!gapi,
  });

  const newFolderModal = useModalState();
  const uploadFileModal = useModalState();
  const confirmModal = useConfirmModal();

  const handleCreateFolder = async (name: string) => {
    if (!accessToken) {
      toast.error("Please sign in to create a folder");
      return;
    }

    if (!name || name.trim() === "") {
      toast.error("Folder name cannot be empty");
      return;
    }

    try {
      const response = await gapi.client.drive.files.create({
        resource: {
          name: name,
          mimeType: "application/vnd.google-apps.folder",
          parents: [currentFolderId],
        },
        fields: "id",
      });

      if (response.status === 200) {
        filesQuery.refetch();
        newFolderModal.close();
        toast.success("Folder created successfully");
      } else {
        throw new Error("Failed to create folder");
      }
    } catch (error) {
      console.error("Error creating folder:", error);
      toast.error("Failed to create folder");
    }
  };

  const handleUploadFile = async (file) => {
    if (!accessToken) {
      toast.error("Please sign in to upload a file");
      return;
    }
    const metadata = {
      name: file.name,
      parents: [currentFolderId],
    };
    const form = new FormData();
    form.append(
      "metadata",
      new Blob([JSON.stringify(metadata)], { type: "application/json" })
    );
    form.append("file", file);

    try {
      await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
        {
          method: "POST",
          headers: new Headers({ Authorization: "Bearer " + accessToken }),
          body: form,
        }
      );
      filesQuery.refetch();
      uploadFileModal.close();
      toast.success("File uploaded successfully");
    } catch (error) {
      toast.error("Failed to upload file");
    }
  };

  const handleDelete = async (file) => {
    if (!accessToken) {
      toast.error("Please sign in to delete a file");
      return;
    }
    try {
      await gapi.client.drive.files.delete({
        fileId: file.id,
      });
      filesQuery.refetch();
      confirmModal.close();
      toast.success("Item deleted successfully");
    } catch (error) {
      toast.error("Failed to delete item");
    }
  };

  const handleShare = async (fileId) => {
    if (!accessToken) {
      toast.error("Please sign in to share a file");
      return;
    }
    try {
      await gapi.client.drive.permissions.create({
        fileId: fileId,
        resource: {
          role: "reader",
          type: "anyone",
        },
      });
      toast.success("File shared successfully");
    } catch (error) {
      toast.error("Failed to share file");
    }
  };

  const handleDownload = async (fileId) => {
    if (!accessToken) {
      toast.error("Please sign in to download a file");
      return;
    }
    try {
      // Fetch file metadata to get the file name and MIME type
      const metadataResponse = await gapi.client.drive.files.get({
        fileId: fileId,
        fields: "name, mimeType",
      });

      const fileName = metadataResponse.result.name;
      const mimeType = metadataResponse.result.mimeType;

      // Fetch the file content
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        {
          headers: new Headers({ Authorization: "Bearer " + accessToken }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to download fil e");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("File downloaded successfully");
    } catch (error) {
      toast.error("Failed to download file");
    }
  };

  const handleOpenFile = (file) => {
    const mimeType = file.mimeType;
    let url = "";

    if (mimeType === "application/vnd.google-apps.document") {
      url = `https://docs.google.com/document/d/${file.id}/edit`;
    } else if (mimeType === "application/vnd.google-apps.spreadsheet") {
      url = `https://docs.google.com/spreadsheets/d/${file.id}/edit`;
    } else if (mimeType === "application/vnd.google-apps.presentation") {
      url = `https://docs.google.com/presentation/d/${file.id}/edit`;
    } else {
      handleDownload(file.id);
      return;
    }

    window.open(url, "_blank");
  };

  const handleFolderClick = (folderId) => {
    setFolderHistory([...folderHistory, folderId]);
    setCurrentFolderId(folderId);
  };

  const handleBack = () => {
    if (folderHistory.length > 1) {
      const newHistory = [...folderHistory];
      newHistory.pop();
      setCurrentFolderId(newHistory[newHistory.length - 1]);
      setFolderHistory(newHistory);
    }
  };

  return (
    <div className="px-4">
      <div className="flex items-start justify-between space-y-2">
        <div className="flex items-start gap-2 flex-col">
          <h2 className="text-lg font-semibold tracking-tight">
            DNR File Management
          </h2>
          <BreadCrumb items={[{ title: "Files", link: "/files" }]} />
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => (accessToken ? setAccessToken(null) : login())}
            size="sm"
          >
            {accessToken ? "Sign Out" : "Sign In"}
          </Button>
          {accessToken && (
            <>
              <Button onClick={() => newFolderModal.open()} size="sm">
                <Folder size={16} className="mr-2" />
                <span>New Folder</span>
              </Button>
              <Button onClick={() => uploadFileModal.open()} size="sm">
                <PlusCircle size={16} className="mr-2" />
                <span>Upload File</span>
              </Button>
              <Button onClick={handleBack} size="sm">
                <ArrowLeft size={16} className="mr-2" />
                <span>Back</span>
              </Button>
            </>
          )}
        </div>
      </div>
      {accessToken ? (
        <DataTable
          isFetching={filesQuery.isFetching}
          isLoading={filesQuery.status === "loading"}
          data={filesQuery?.data?.files || []}
          columns={columns}
          onSearch={setSearchText}
          sorting={sorting}
          setSorting={setSorting}
          pageCount={
            filesQuery?.data?.nextPageToken ? pageIndex + 2 : pageIndex + 1
          }
          setPagination={setPagination}
          pageIndex={pageIndex}
          pageSize={pageSize}
          setColumnFilters={setColumnFilters}
          columnFilters={columnFilters}
          facets={[]} // Ensure facets is an array
          defaultColumnVisibility={{}} // Add appropriate default column visibility here
        />
      ) : (
        <div className="text-center mt-8">
          Please sign in to view your DNR Files Managment.
        </div>
      )}

      {/* TODO: Implement NewFolderModal, UploadFileModal components */}

      <ConfirmModal
        title={"Are you sure you want to delete this item?"}
        description={"This action cannot be undone."}
        meta={confirmModal.meta}
        onConfirm={handleDelete}
        isLoading={confirmModal.isLoading}
        open={confirmModal.isOpen}
        onClose={() => confirmModal.close()}
      />

      {/* New Folder Modal */}
      {newFolderModal.isOpen && (
        <div className="modal">
          <div className="modal-content">
            <h3>Create New Folder</h3>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder Name"
            />
            <Button onClick={() => handleCreateFolder(newFolderName)}>
              Create
            </Button>
            <Button onClick={() => newFolderModal.close()}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Upload File Modal */}
      {uploadFileModal.isOpen && (
        <div className="modal">
          <div className="modal-content">
            <h3>Upload File</h3>
            <input
              type="file"
              onChange={(e) => setFileToUpload(e.target.files[0])}
            />
            <Button onClick={() => handleUploadFile(fileToUpload)}>
              Upload
            </Button>
            <Button onClick={() => uploadFileModal.close()}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FileManager() {
  return (
    <GoogleOAuthProvider clientId={CLIENT_ID}>
      <FileManagerContent />
    </GoogleOAuthProvider>
  );
}
