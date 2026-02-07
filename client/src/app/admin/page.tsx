"use client";

import React, { useState, useCallback, useEffect } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

interface Node {
  id: string;
  nodeId: string;
  type: "farm" | "warehouse" | "ngo" | "processing";
  name: string;
  regionId: string;
  district: string;
  location: {
    type: string;
    coordinates: [number, number];
  };
  capacity_kg?: number;
  contact?: string;
}

interface ApiNode {
  _id: string;
  nodeId?: string;
  type: "farm" | "warehouse" | "ngo" | "processing";
  name: string;
  regionId: string;
  district: string;
  location: {
    type: string;
    coordinates: [number, number];
  };
  capacity_kg?: number;
  contact?: string;
}

// const MOCK_DISTRICTS = [
//   "Mumbai",
//   "Delhi",
//   "Bangalore",
//   "Kolkata",
//   "Chennai",
//   "Hyderabad",
//   "Pune",
//   "Ahmedabad",
// ];

// fetching district data from backend

const MOCK_DATA: Record<string, Node[]> = {
  Mumbai: [
    {
      id: "1",
      nodeId: "FARM001",
      type: "farm",
      name: "Green Valley Farm",
      regionId: "Mumbai",
      district: "Mumbai",
      location: { type: "Point", coordinates: [72.8777, 19.076] },
      capacity_kg: 5000,
      contact: "+91 98765 43210",
    },
    {
      id: "2",
      nodeId: "WH001",
      type: "warehouse",
      name: "Central Storage Facility",
      regionId: "Mumbai",
      district: "Mumbai",
      location: { type: "Point", coordinates: [72.8311, 18.9388] },
      capacity_kg: 50000,
      contact: "+91 98765 43211",
    },
    {
      id: "3",
      nodeId: "NGO001",
      type: "ngo",
      name: "Food For All Mumbai",
      regionId: "Mumbai",
      district: "Mumbai",
      location: { type: "Point", coordinates: [72.8479, 19.0176] },
      contact: "+91 98765 43212",
    },
  ],
  Delhi: [
    {
      id: "4",
      nodeId: "FARM002",
      type: "farm",
      name: "Capital Organic Farm",
      regionId: "Delhi",
      district: "Delhi",
      location: { type: "Point", coordinates: [77.1025, 28.7041] },
      capacity_kg: 3000,
      contact: "+91 98765 43213",
    },
    {
      id: "5",
      nodeId: "WH002",
      type: "warehouse",
      name: "North Delhi Warehouse",
      regionId: "Delhi",
      district: "Delhi",
      location: { type: "Point", coordinates: [77.2315, 28.6139] },
      capacity_kg: 40000,
      contact: "+91 98765 43214",
    },
  ],
};

export default function AdminDashboard() {
  const [selectedDistrict, setSelectedDistrict] = useState<string>("");
  const [filteredNodes, setFilteredNodes] = useState<Node[]>([]);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [allNodes, setAllNodes] = useState<Record<string, Node[]>>(MOCK_DATA);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [DISTRICTS, setMockDistricts] = useState<string[]>([]);

  // District search state
  const [districtSearchOpen, setDistrictSearchOpen] = useState(false);
  const [districtSearchQuery, setDistrictSearchQuery] = useState("");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  const [totalPages, setTotalPages] = useState(1);
  const [totalNodes, setTotalNodes] = useState(0);

  // Form state for new node
  const [newNode, setNewNode] = useState({
    type: "farm" as "farm" | "warehouse" | "ngo" | "processing",
    name: "",
    regionId: "",
    capacity_kg: "",
    contact: "",
    latitude: "",
    longitude: "",
  });

  useEffect(() => {
    const fetchDistricts = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/node/getAllDistricts`);
        if (!response.ok) {
          throw new Error(`Failed to fetch districts: ${response.statusText}`);
        }
        const result = await response.json();
        setMockDistricts(result.data.districts);
      } catch (err) {
        console.error("Error fetching districts:", err);
      }
    };

    fetchDistricts();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (districtSearchOpen && !target.closest(".district-dropdown")) {
        setDistrictSearchOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [districtSearchOpen]);

  // all nodes on initial render

  useEffect(() => {
    fetchNodes("", 1, itemsPerPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsPerPage]);

  // Fetch nodes from API
  const fetchNodes = useCallback(
    async (
      district: string,
      page: number = 1,
      newLimit: number = itemsPerPage
    ) => {
      setIsLoading(true);
      setError(null);

      try {
        // Determine endpoint based on district selection
        const endpoint = district
          ? `${API_BASE_URL}/node/district/${district}?page=${page}&limit=${newLimit}`
          : `${API_BASE_URL}/node/getAllNodes?page=${page}&limit=${newLimit}`;

        const response = await fetch(endpoint);

        if (!response.ok) {
          throw new Error(`Failed to fetch nodes: ${response.statusText}`);
        }

        const result = await response.json();

        // Map API response to Node interface
        const nodes: Node[] = result.data.nodes.map((node: ApiNode) => ({
          id: node._id,
          nodeId: node.nodeId || node._id,
          type: node.type,
          name: node.name,
          regionId: node.regionId,
          district: node.district,
          location: node.location,
          capacity_kg: node.capacity_kg,
          contact: node.contact,
        }));

        // Update state
        setFilteredNodes(nodes);
        setCurrentPage(page);
        setTotalPages(result.data.pagination.totalPages);
        setTotalNodes(result.data.totalNodes);

        // Update cache if fetching specific district
        if (district) {
          setAllNodes((prev) => ({
            ...prev,
            [district]: nodes,
          }));
        }
      } catch (err) {
        console.error("Error fetching nodes:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch nodes");
        setFilteredNodes([]);
        setCurrentPage(1);
        setTotalPages(1);
        setTotalNodes(0);
      } finally {
        setIsLoading(false);
      }
    },
    [itemsPerPage]
  );

  const handleDistrictChange = useCallback(
    async (district: string, page: number = 1) => {
      setSelectedDistrict(district);
      setActiveTab("all");
      await fetchNodes(district, page);
    },
    [fetchNodes]
  );

  // Handle page change
  const handlePageChange = useCallback(
    (newPage: number) => {
      if (newPage < 1 || newPage > totalPages) return;
      handleDistrictChange(selectedDistrict, newPage);
    },
    [selectedDistrict, totalPages, handleDistrictChange]
  );

  const farms = filteredNodes.filter((node) => node.type === "farm");
  const warehouses = filteredNodes.filter((node) => node.type === "warehouse");
  const ngos = filteredNodes.filter((node) => node.type === "ngo");
  const processing = filteredNodes.filter((node) => node.type === "processing");

  const getDisplayNodes = () => {
    switch (activeTab) {
      case "farm":
        return farms;
      case "warehouse":
        return warehouses;
      case "ngo":
        return ngos;
      case "processing":
        return processing;
      default:
        return filteredNodes;
    }
  };

  const displayNodes = getDisplayNodes();

  // Handle form submission
  const handleAddNode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (
      !newNode.name ||
      !newNode.regionId ||
      !newNode.latitude ||
      !newNode.longitude
    ) {
      alert("Please fill in all required fields");
      return;
    }

    setIsLoading(true);

    try {
      // Prepare data in backend format
      const nodeData = {
        type: newNode.type,
        name: newNode.name,
        regionId: newNode.regionId,
        district: newNode.regionId, // Using regionId as district
        location: {
          type: "Point",
          coordinates: [
            parseFloat(newNode.longitude),
            parseFloat(newNode.latitude),
          ],
        },
        capacity_kg: newNode.capacity_kg ? parseInt(newNode.capacity_kg) : 0,
        contact: newNode.contact || null,
      };

      const response = await fetch(`${API_BASE_URL}/addNewNode`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(nodeData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || `Failed to create node: ${response.statusText}`
        );
      }

      const result = await response.json();
      const createdNode = result.data;

      // Convert to frontend format
      const frontendNode: Node = {
        id: createdNode._id,
        nodeId: createdNode.nodeId || createdNode._id,
        type: createdNode.type,
        name: createdNode.name,
        regionId: createdNode.regionId,
        district: createdNode.district,
        location: createdNode.location,
        capacity_kg: createdNode.capacity_kg,
        contact: createdNode.contact,
      };

      // Update allNodes cache
      const updatedNodes = { ...allNodes };
      if (!updatedNodes[newNode.regionId]) {
        updatedNodes[newNode.regionId] = [];
      }
      updatedNodes[newNode.regionId] = [
        ...updatedNodes[newNode.regionId],
        frontendNode,
      ];
      setAllNodes(updatedNodes);

      // Update filtered nodes if same district
      if (selectedDistrict === newNode.regionId) {
        setFilteredNodes(updatedNodes[newNode.regionId]);
      }

      // Reset form and close modal
      setNewNode({
        type: "farm",
        name: "",
        regionId: "",
        capacity_kg: "",
        contact: "",
        latitude: "",
        longitude: "",
      });
      setIsAddModalOpen(false);

      alert(
        `✅ ${newNode.type.charAt(0).toUpperCase() + newNode.type.slice(1)} "${createdNode.name}" added successfully!`
      );
    } catch (err) {
      console.error("Error adding node:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Failed to add node";
      setError(errorMessage);
      alert(`❌ Error: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle delete node
  const handleDeleteNode = async (nodeId: string, nodeName: string) => {
    if (!confirm(`Are you sure you want to delete "${nodeName}"?`)) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/deleteNode/${nodeId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || `Failed to delete node: ${response.statusText}`
        );
      }

      // Remove from allNodes cache
      const updatedNodes = { ...allNodes };
      Object.keys(updatedNodes).forEach((district) => {
        updatedNodes[district] = updatedNodes[district].filter(
          (node) => node.id !== nodeId
        );
      });
      setAllNodes(updatedNodes);

      // Update filtered nodes if viewing that district
      if (selectedDistrict) {
        setFilteredNodes(updatedNodes[selectedDistrict] || []);
      }

      alert(`🗑️ "${nodeName}" deleted successfully!`);
    } catch (err) {
      console.error("Error deleting node:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Failed to delete node";
      setError(errorMessage);
      alert(`❌ Error: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded bg-zinc-900 dark:bg-zinc-100">
                <svg
                  className="h-5 w-5 text-white dark:text-black"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                  Supply Chain Dashboard
                </h1>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Network Operations Center
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                India Region
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {/* District Filter */}
            <div className="relative flex items-center gap-2 district-dropdown">
              <label
                htmlFor="district"
                className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                District
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setDistrictSearchOpen(!districtSearchOpen)}
                  className="flex min-w-[200px] items-center justify-between gap-2 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 hover:border-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-600 dark:focus:border-zinc-500 dark:focus:ring-zinc-500"
                >
                  <span className="truncate">
                    {selectedDistrict || "All Districts"}
                  </span>
                  <svg
                    className={`h-4 w-4 transition-transform ${districtSearchOpen ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                {/* Dropdown Menu */}
                {districtSearchOpen && (
                  <div className="absolute left-0 top-full z-50 mt-1 w-[280px] rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                    {/* Search Input */}
                    <div className="border-b border-zinc-200 p-2 dark:border-zinc-700">
                      <div className="relative">
                        <svg
                          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                          />
                        </svg>
                        <input
                          type="text"
                          placeholder="Search districts..."
                          value={districtSearchQuery}
                          onChange={(e) =>
                            setDistrictSearchQuery(e.target.value)
                          }
                          className="w-full rounded border border-zinc-300 bg-white py-1.5 pl-9 pr-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-500"
                        />
                      </div>
                    </div>

                    {/* District List */}
                    <div className="max-h-[300px] overflow-y-auto p-1">
                      {/* All Districts Option */}
                      <button
                        onClick={() => {
                          handleDistrictChange("");
                          setDistrictSearchOpen(false);
                          setDistrictSearchQuery("");
                        }}
                        className={`w-full rounded px-3 py-2 text-left text-sm transition-colors ${
                          selectedDistrict === ""
                            ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                            : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        }`}
                      >
                        All Districts
                      </button>

                      {/* Filtered Districts */}
                      {DISTRICTS.filter((district) =>
                        district
                          .toLowerCase()
                          .includes(districtSearchQuery.toLowerCase())
                      ).map((district) => (
                        <button
                          key={district}
                          onClick={() => {
                            handleDistrictChange(district);
                            setDistrictSearchOpen(false);
                            setDistrictSearchQuery("");
                          }}
                          className={`w-full rounded px-3 py-2 text-left text-sm transition-colors ${
                            selectedDistrict === district
                              ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                              : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          }`}
                        >
                          {district}
                        </button>
                      ))}

                      {/* No results message */}
                      {DISTRICTS.filter((district) =>
                        district
                          .toLowerCase()
                          .includes(districtSearchQuery.toLowerCase())
                      ).length === 0 &&
                        districtSearchQuery && (
                          <div className="px-3 py-2 text-center text-sm text-zinc-500 dark:text-zinc-400">
                            No districts found
                          </div>
                        )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Items Per Page Selector */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="itemsPerPage"
                className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Rows
              </label>
              <select
                id="itemsPerPage"
                value={itemsPerPage}
                onChange={(e) => {
                  const newLimit = parseInt(e.target.value);
                  setItemsPerPage(newLimit);
                  fetchNodes(selectedDistrict, 1, newLimit);
                }}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-500 dark:focus:ring-zinc-500"
              >
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <span>Showing:</span>
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {selectedDistrict || "All Districts"}
              </span>
            </div>
            <button
              onClick={() => {
                // Pre-fill district if one is selected
                if (selectedDistrict) {
                  setNewNode({ ...newNode, regionId: selectedDistrict });
                }
                setIsAddModalOpen(true);
              }}
              className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 transition-colors dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Add New Node
            </button>
          </div>
        </div>

        {filteredNodes.length > 0 && !isLoading && (
          <>
            <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <button
                onClick={() => setActiveTab("farm")}
                className={`rounded-lg border p-4 text-left transition-colors ${activeTab === "farm" ? "border-green-600 bg-green-50 dark:border-green-500 dark:bg-green-950" : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"}`}
              >
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Farms
                </div>
                <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                  {farms.length}
                </div>
              </button>

              <button
                onClick={() => setActiveTab("warehouse")}
                className={`rounded-lg border p-4 text-left transition-colors ${activeTab === "warehouse" ? "border-blue-600 bg-blue-50 dark:border-blue-500 dark:bg-blue-950" : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"}`}
              >
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Warehouses
                </div>
                <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                  {warehouses.length}
                </div>
              </button>

              <button
                onClick={() => setActiveTab("ngo")}
                className={`rounded-lg border p-4 text-left transition-colors ${activeTab === "ngo" ? "border-purple-600 bg-purple-50 dark:border-purple-500 dark:bg-purple-950" : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"}`}
              >
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  NGOs
                </div>
                <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                  {ngos.length}
                </div>
              </button>

              <button
                onClick={() => setActiveTab("processing")}
                className={`rounded-lg border p-4 text-left transition-colors ${activeTab === "processing" ? "border-orange-600 bg-orange-50 dark:border-orange-500 dark:bg-orange-950" : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"}`}
              >
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Processing
                </div>
                <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                  {processing.length}
                </div>
              </button>
            </div>

            {/* Pagination Controls - Top */}
            {totalPages > 1 && itemsPerPage >= 50 && (
              <div className="mb-4 flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                  <span>
                    Showing{" "}
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {(currentPage - 1) * itemsPerPage + 1}
                    </span>{" "}
                    to{" "}
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {Math.min(currentPage * itemsPerPage, totalNodes)}
                    </span>{" "}
                    of{" "}
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {totalNodes}
                    </span>{" "}
                    results
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Previous Button */}
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:disabled:hover:bg-zinc-800"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                    Previous
                  </button>

                  {/* Page Numbers */}
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }

                      return (
                        <button
                          key={pageNum}
                          onClick={() => handlePageChange(pageNum)}
                          className={`min-w-10 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                            currentPage === pageNum
                              ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                              : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>

                  {/* Next Button */}
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:disabled:hover:bg-zinc-800"
                  >
                    Next
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            <div className="mb-4 flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800">
              <button
                onClick={() => setActiveTab("all")}
                className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${activeTab === "all" ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"}`}
              >
                All ({filteredNodes.length})
              </button>
              <button
                onClick={() => setActiveTab("farm")}
                className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${activeTab === "farm" ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"}`}
              >
                Farms ({farms.length})
              </button>
              <button
                onClick={() => setActiveTab("warehouse")}
                className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${activeTab === "warehouse" ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"}`}
              >
                Warehouses ({warehouses.length})
              </button>
              <button
                onClick={() => setActiveTab("ngo")}
                className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${activeTab === "ngo" ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"}`}
              >
                NGOs ({ngos.length})
              </button>
              <button
                onClick={() => setActiveTab("processing")}
                className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${activeTab === "processing" ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"}`}
              >
                Processing ({processing.length})
              </button>
            </div>

            <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Node ID
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Capacity
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Contact
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Location
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {displayNodes.length > 0 ? (
                    displayNodes.map((node) => (
                      <tr
                        key={node.id}
                        className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      >
                        <td className="px-4 py-3 text-sm font-mono text-zinc-600 dark:text-zinc-400">
                          {node.nodeId}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-zinc-900 dark:text-zinc-100">
                            {node.name}
                          </div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400">
                            {node.regionId}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${node.type === "farm" ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" : node.type === "warehouse" ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400" : node.type === "ngo" ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400" : "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400"}`}
                          >
                            {node.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-zinc-900 dark:text-zinc-100">
                          {node.capacity_kg
                            ? `${node.capacity_kg.toLocaleString()} kg`
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                          {node.contact || "—"}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-zinc-500 dark:text-zinc-400">
                          {node.location.coordinates[1].toFixed(4)},{" "}
                          {node.location.coordinates[0].toFixed(4)}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleDeleteNode(node.id, node.name)}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors"
                            title="Delete node"
                          >
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400"
                      >
                        No facilities found in this category
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls - Bottom */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                  <span>
                    Showing{" "}
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {(currentPage - 1) * itemsPerPage + 1}
                    </span>{" "}
                    to{" "}
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {Math.min(currentPage * itemsPerPage, totalNodes)}
                    </span>{" "}
                    of{" "}
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {totalNodes}
                    </span>{" "}
                    results
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Previous Button */}
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:disabled:hover:bg-zinc-800"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                    Previous
                  </button>

                  {/* Page Numbers */}
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }

                      return (
                        <button
                          key={pageNum}
                          onClick={() => handlePageChange(pageNum)}
                          className={`min-w-10 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                            currentPage === pageNum
                              ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                              : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>

                  {/* Next Button */}
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:disabled:hover:bg-zinc-800"
                  >
                    Next
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {filteredNodes.length === 0 && !isLoading && !error && (
          <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-center">
              <svg
                className="mx-auto h-12 w-12 text-zinc-400 dark:text-zinc-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                />
              </svg>
              <h3 className="mt-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                No district selected
              </h3>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Select a district to view facilities
              </p>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-center">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-zinc-200 border-t-zinc-900 dark:border-zinc-800 dark:border-t-zinc-100"></div>
              <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                Loading nodes...
              </p>
            </div>
          </div>
        )}

        {error && !isLoading && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
            <div className="flex items-start gap-3">
              <svg
                className="h-5 w-5 text-red-600 dark:text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                  Error loading nodes
                </h3>
                <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                  {error}
                </p>
                <button
                  onClick={() => handleDistrictChange(selectedDistrict)}
                  className="mt-2 text-sm font-medium text-red-800 hover:text-red-900 dark:text-red-200 dark:hover:text-red-100"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Add Node Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl dark:bg-zinc-900">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Add New Node
              </h2>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleAddNode} className="p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Node Type */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Node Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newNode.type}
                    onChange={(e) =>
                      setNewNode({
                        ...newNode,
                        type: e.target.value as
                          | "farm"
                          | "warehouse"
                          | "ngo"
                          | "processing",
                      })
                    }
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    required
                  >
                    <option value="farm">🌾 Farm</option>
                    <option value="warehouse">📦 Warehouse</option>
                    <option value="ngo">❤️ NGO</option>
                    <option value="processing">🏭 Processing</option>
                  </select>
                </div>

                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newNode.name}
                    onChange={(e) =>
                      setNewNode({ ...newNode, name: e.target.value })
                    }
                    placeholder="e.g., Green Valley Farm"
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    required
                  />
                </div>

                {/* District */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    District/Region <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newNode.regionId}
                    onChange={(e) =>
                      setNewNode({ ...newNode, regionId: e.target.value })
                    }
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    required
                  >
                    <option value="">Select district</option>
                    {DISTRICTS.map((district) => (
                      <option key={district} value={district}>
                        {district}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Contact */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Contact
                  </label>
                  <input
                    type="text"
                    value={newNode.contact}
                    onChange={(e) =>
                      setNewNode({ ...newNode, contact: e.target.value })
                    }
                    placeholder="+91 98765 43210"
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>

                {/* Capacity */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Capacity (kg)
                  </label>
                  <input
                    type="number"
                    value={newNode.capacity_kg}
                    onChange={(e) =>
                      setNewNode({ ...newNode, capacity_kg: e.target.value })
                    }
                    placeholder="5000"
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>

                {/* Latitude */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Latitude <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={newNode.latitude}
                    onChange={(e) =>
                      setNewNode({ ...newNode, latitude: e.target.value })
                    }
                    placeholder="19.0760"
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    required
                  />
                </div>

                {/* Longitude */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Longitude <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={newNode.longitude}
                    onChange={(e) =>
                      setNewNode({ ...newNode, longitude: e.target.value })
                    }
                    placeholder="72.8777"
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    required
                  />
                </div>
              </div>

              {/* Form Actions */}
              <div className="mt-6 flex items-center justify-end gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  Add Node
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
