"use strict";

// Global state
let typemapRules = [];
let currentSortBy = "order";
let currentSortDirection = "asc";
let editingRow = null;
let hasUnsavedChanges = false;

// Column resizing state
let isResizing = false;
let currentColumn = -1;
let startX = 0;
let startWidth = 0;

// File type definitions
const fileTypes = {
  binary: {
    label: "Binary - Binary file",
    description: "Synced as binary files, stored compressed",
  },
  text: {
    label: "Text - Plain text file",
    description: "Line-ending translations performed automatically",
  },
  symlink: {
    label: "Symbolic Link - Unix/Mac symbolic link",
    description: "Treated as symbolic links on supported platforms",
  },
  unicode: {
    label: "Unicode - Unicode text file",
    description: "Translated to local character set (P4CHARSET)",
  },
  utf8: {
    label: "UTF-8 - Unicode file with BOM",
    description: "Synced with UTF-8 byte order mark",
  },
  utf16: {
    label: "UTF-16 - Unicode 16 file",
    description: "Transferred as UTF-8, translated to UTF-16 in workspace",
  },
};

const fileModifiers = {
  w: {
    label: "Always Writable",
    description: "File is always writable on client",
  },
  x: { label: "Executable", description: "Execute bit set on client" },
  l: {
    label: "Exclusive Lock",
    description: "Only one user can edit at a time",
  },
  k: {
    label: "RCS Keywords",
    description: "Expands $Id$, $Date$, $Author$, etc.",
  },
  ko: {
    label: "Limited Keywords",
    description: "Only expands $Id$ and $Header$",
  },
  C: {
    label: "Store Compressed",
    description: "Full compressed version per revision",
  },
  D: { label: "RCS Storage", description: "Store deltas in RCS format" },
  F: {
    label: "Store Uncompressed",
    description: "Full file per revision, uncompressed",
  },
  S: { label: "Head Only", description: "Only store latest revision" },
  S10: {
    label: "Keep 10 Revisions",
    description: "Store most recent 10 revisions",
  },
  m: {
    label: "Preserve Modtime",
    description: "Keep original file modification time",
  },
  X: {
    label: "Archive Trigger",
    description: "Requires archive trigger to access",
  },
};

// Initialize the editor
async function initializeTypemapEditor() {
  try {
    // Initialize theme first
    initializeTheme();

    updateStatus("Loading typemap...");
    await loadTypemap();
    updateStatus("Ready");

    // Initialize Save button state
    updateSaveButtonState();
  } catch (error) {
    updateStatus("Error loading typemap: " + error.message);
    console.error("Initialization error:", error);
  }
}

// Track changes and update Save button state
function markAsChanged() {
  hasUnsavedChanges = true;
  updateSaveButtonState();
}

function markAsSaved() {
  hasUnsavedChanges = false;
  updateSaveButtonState();
}

function updateSaveButtonState() {
  const saveButton = document.querySelector('button[onclick="saveTypemap()"]');
  if (saveButton) {
    saveButton.disabled = !hasUnsavedChanges;
  }
}

// Load typemap from Perforce
async function loadTypemap() {
  try {
    const result = await p4vjs.p4(["typemap", "-o"]);

    if (result.error) {
      throw new Error(result.error);
    }

    // Parse the typemap data
    typemapRules = parseTypemapData(result.data);
    renderTable();
    updateRuleCount();

    // Reset change tracking after loading
    markAsSaved();

    document.getElementById("loadingIndicator").style.display = "none";
    document.getElementById("typemapTable").style.display = "table";
  } catch (error) {
    updateStatus("Error loading typemap: " + error.message);
    throw error;
  }
}

// Parse typemap data from P4 result
function parseTypemapData(data) {
  const rules = [];
  let order = 1;

  if (data && data.length > 0) {
    const typemapData = data[0];

    // Extract all TypeMapN properties and sort them numerically
    const typemapEntries = [];
    for (const key in typemapData) {
      if (key.startsWith("TypeMap")) {
        const index = parseInt(key.replace("TypeMap", ""));
        typemapEntries.push({ index, value: typemapData[key] });
      }
    }

    // Sort by index to maintain order
    typemapEntries.sort((a, b) => a.index - b.index);

    // Parse each entry
    for (const entry of typemapEntries) {
      const line = entry.value;
      const trimmedLine = line.trim();

      // Skip empty lines and pure comment lines
      if (!trimmedLine || trimmedLine.startsWith("##")) {
        continue;
      }

      // Parse line: "filetype pattern ## comment"
      const commentIndex = trimmedLine.indexOf("##");
      let workingLine =
        commentIndex >= 0
          ? trimmedLine.substring(0, commentIndex).trim()
          : trimmedLine;
      const comment =
        commentIndex >= 0 ? trimmedLine.substring(commentIndex + 2).trim() : "";

      // Split into filetype and pattern
      const parts = workingLine.split(/\s+/);
      if (parts.length >= 2) {
        const filetype = parts[0];
        const pattern = parts.slice(1).join(" "); // In case pattern has spaces

        rules.push({
          id: generateId(),
          order: order++,
          filetype: filetype,
          pattern: pattern,
          comment: comment,
          originalLine: line,
        });
      }
    }
  }

  return rules;
}

// Generate unique ID for rules
function generateId() {
  return "rule_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
}

// Render the table
function renderTable() {
  const tbody = document.getElementById("typemapTableBody");
  tbody.innerHTML = "";

  const rulesToShow = getSortedRules();

  rulesToShow.forEach((rule, index) => {
    const row = createTableRow(rule, index);
    tbody.appendChild(row);
  });

  // Update conflict detection
  detectAndShowConflicts();
}

// Create a table row for a rule
function createTableRow(rule, displayIndex) {
  const row = document.createElement("tr");
  row.setAttribute("data-rule-id", rule.id);

  // Add warning class if there are conflicts
  const conflicts = checkRuleConflicts(rule);
  if (conflicts.length > 0) {
    row.classList.add("has-conflict");
  }

  // Check if this is the first or last rule for button states (based on actual order, not display order)
  const sortedByOrder = [...typemapRules].sort((a, b) => a.order - b.order);
  const orderIndex = sortedByOrder.findIndex((r) => r.id === rule.id);
  const isFirst = orderIndex === 0;
  const isLast = orderIndex === sortedByOrder.length - 1;

  row.innerHTML = `
        <td class="priority-cell">
            <div class="execution-order-controls">
                <button onclick="moveRuleUp('${
                  rule.id
                }')" class="btn order-button" title="Move Up" ${
    isFirst ? "disabled" : ""
  }>↑</button>
                <span>${rule.order}</span>
                <button onclick="moveRuleDown('${
                  rule.id
                }')" class="btn order-button" title="Move Down" ${
    isLast ? "disabled" : ""
  }>↓</button>
            </div>
        </td>
        <td class="file-type-cell">
            <div class="file-type-display" onclick="editFileType('${rule.id}')">
                <span class="type-label">${getFileTypeDescription(
                  rule.filetype
                )}</span>
                <code class="type-code">${rule.filetype}</code>
            </div>
            ${
              conflicts.length > 0
                ? `<div class="conflict-warning">⚠️ ${conflicts.join(
                    "; "
                  )}</div>`
                : ""
            }
        </td>
        <td>
            <input type="text" class="pattern-input" value="${escapeHtml(
              rule.pattern
            )}" 
                   onchange="updateRulePattern('${rule.id}', this.value)" 
                   onblur="validatePattern('${rule.id}', this.value)">
        </td>
        <td>
            <input type="text" class="comment-input" value="${escapeHtml(
              rule.comment
            )}" 
                   onchange="updateRuleComment('${rule.id}', this.value)">
        </td>
        <td class="actions-cell">
            <button onclick="deleteRule('${
              rule.id
            }')" class="btn danger" title="Delete Rule">🗑️</button>
        </td>
    `;

  return row;
}

// Get human-readable description of file type
function getFileTypeDescription(filetype) {
  const [baseType, modifierString] = filetype.split("+");

  // Parse modifiers more carefully to handle multi-character ones like S10
  const modifiers = [];
  if (modifierString) {
    let i = 0;
    while (i < modifierString.length) {
      // Check for multi-character modifiers first (S followed by digits)
      if (
        modifierString[i] === "S" &&
        i + 1 < modifierString.length &&
        /\d/.test(modifierString[i + 1])
      ) {
        let j = i + 1;
        while (j < modifierString.length && /\d/.test(modifierString[j])) {
          j++;
        }
        modifiers.push(modifierString.substring(i, j));
        i = j;
      } else {
        modifiers.push(modifierString[i]);
        i++;
      }
    }
  }

  let description = fileTypes[baseType]
    ? fileTypes[baseType].label.split(" - ")[1]
    : baseType;

  if (modifiers.length > 0) {
    const modifierDescriptions = modifiers
      .map((mod) => {
        if (fileModifiers[mod]) {
          return fileModifiers[mod].label;
        } else if (mod === "S") {
          return "Head Only";
        } else if (mod.startsWith("S") && /\d/.test(mod.substring(1))) {
          const revisionCount = mod.substring(1);
          return `Latest ${revisionCount} Only`;
        } else {
          // For unknown modifiers, just show the modifier code
          return mod;
        }
      })
      .join(", ");
    description += ` (${modifierDescriptions})`;
  }

  return description;
}

// Escape HTML for safe display
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Update rule pattern
function updateRulePattern(ruleId, newPattern) {
  const rule = typemapRules.find((r) => r.id === ruleId);
  if (rule) {
    rule.pattern = newPattern;
    markAsChanged();
    // Re-check conflicts when pattern changes
    setTimeout(() => renderTable(), 100);
  }
}

// Update rule comment
function updateRuleComment(ruleId, newComment) {
  const rule = typemapRules.find((r) => r.id === ruleId);
  if (rule) {
    rule.comment = newComment;
    markAsChanged();
  }
}

// Validate pattern
function validatePattern(ruleId, pattern) {
  const warnings = [];

  // Basic validations
  if (!pattern.startsWith("//")) {
    warnings.push("Pattern should start with //");
  }

  if (!pattern.includes("...")) {
    warnings.push("Pattern should include ... for wildcards");
  }

  // Show warnings if any
  if (warnings.length > 0) {
    // You could add a validation warning display here
    console.warn("Pattern validation warnings:", warnings);
  }
}

// Add new rule
function addNewRule() {
  const newRule = {
    id: generateId(),
    order: typemapRules.length + 1,
    filetype: "binary",
    pattern: "//....",
    comment: "",
    originalLine: "",
  };

  typemapRules.push(newRule);
  markAsChanged();
  renderTable();
  updateRuleCount();

  // Scroll to the new rule and edit it
  setTimeout(() => {
    const row = document.querySelector(`[data-rule-id="${newRule.id}"]`);
    if (row) {
      row.scrollIntoView();
      editFileType(newRule.id);
    }
  }, 100);
}

// Delete rule
function deleteRule(ruleId) {
  if (confirm("Are you sure you want to delete this rule?")) {
    typemapRules = typemapRules.filter((r) => r.id !== ruleId);
    reorderRules();
    markAsChanged();
    renderTable();
    updateRuleCount();
  }
}

// Move rule up
function moveRuleUp(ruleId) {
  const currentRule = typemapRules.find((r) => r.id === ruleId);
  if (!currentRule) return;

  // Find the rule with the next lower order value
  const previousRule = typemapRules.find(
    (r) => r.order === currentRule.order - 1
  );

  if (previousRule) {
    // Swap their order values
    const tempOrder = currentRule.order;
    currentRule.order = previousRule.order;
    previousRule.order = tempOrder;

    markAsChanged();
    renderTable();
  }
}

// Move rule down
function moveRuleDown(ruleId) {
  const currentRule = typemapRules.find((r) => r.id === ruleId);
  if (!currentRule) return;

  // Find the rule with the next higher order value
  const nextRule = typemapRules.find((r) => r.order === currentRule.order + 1);

  if (nextRule) {
    // Swap their order values
    const tempOrder = currentRule.order;
    currentRule.order = nextRule.order;
    nextRule.order = tempOrder;

    markAsChanged();
    renderTable();
  }
}

// Reorder rules to maintain sequential order numbers
function reorderRules() {
  typemapRules.sort((a, b) => a.order - b.order);
  typemapRules.forEach((rule, index) => {
    rule.order = index + 1;
  });
}

// Edit file type
function editFileType(ruleId) {
  const rule = typemapRules.find((r) => r.id === ruleId);
  if (!rule) return;

  // Close any existing editor
  cancelFileTypeEdit();

  // Find the cell and replace content with editor
  const row = document.querySelector(`[data-rule-id="${ruleId}"]`);
  const cell = row.querySelector(".file-type-cell");

  // Hide the display and show editor
  const display = cell.querySelector(".file-type-display");
  display.style.display = "none";

  // Create editor from template
  const template = document.getElementById("fileTypeEditorTemplate");
  const editor = template.cloneNode(true);
  editor.id = `editor_${ruleId}`;
  editor.style.display = "block";

  // Set current values
  const [baseType, modifierString] = rule.filetype.split("+");

  // Parse modifiers more carefully to handle S modifiers
  const modifiers = [];
  let sModifier = null;

  if (modifierString) {
    let i = 0;
    while (i < modifierString.length) {
      // Check for S modifier with optional number
      if (modifierString[i] === "S") {
        let j = i + 1;
        while (j < modifierString.length && /\d/.test(modifierString[j])) {
          j++;
        }
        sModifier = modifierString.substring(i, j);
        i = j;
      } else {
        modifiers.push(modifierString[i]);
        i++;
      }
    }
  }

  editor.querySelector("#baseFileType").value = baseType;

  // Set regular checkboxes
  editor.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.checked = modifiers.includes(cb.value);
  });

  // Handle S modifier specially
  const sCheckbox = editor.querySelector("#sModifierCheckbox");
  const sValue = editor.querySelector("#sModifierValue");
  if (sModifier) {
    sCheckbox.checked = true;
    if (sModifier === "S") {
      sValue.value = ""; // Head only
    } else {
      sValue.value = sModifier.substring(1); // Extract number after S
    }
  } else {
    sCheckbox.checked = false;
    sValue.value = "";
  }

  cell.appendChild(editor);
  editingRow = ruleId;

  updateFileTypePreview();
}

// Update file type preview
function updateFileTypePreview() {
  if (!editingRow) return;

  const editor = document.getElementById(`editor_${editingRow}`);
  if (!editor) return;

  const baseType = editor.querySelector("#baseFileType").value;

  // Get regular modifiers (exclude the S modifier checkbox)
  const modifiers = Array.from(
    editor.querySelectorAll(
      'input[type="checkbox"]:checked:not(#sModifierCheckbox)'
    )
  ).map((cb) => cb.value);

  // Handle the custom S modifier separately
  const sCheckbox = editor.querySelector("#sModifierCheckbox");
  const sValue = editor.querySelector("#sModifierValue");
  if (sCheckbox && sCheckbox.checked) {
    const revisionCount = sValue.value.trim();
    if (revisionCount && revisionCount !== "1") {
      modifiers.push(`S${revisionCount}`);
    } else {
      modifiers.push("S");
    }
  }

  const fullType =
    modifiers.length > 0 ? `${baseType}+${modifiers.join("")}` : baseType;

  // Update preview
  const preview = editor.querySelector("#resultingType");
  if (preview) {
    preview.textContent = fullType;
  }

  // Update help text
  const helpText = editor.querySelector("#fileTypeHelp");
  const typeInfo = fileTypes[baseType];
  if (helpText && typeInfo) {
    helpText.textContent = typeInfo.description;
  }

  // Validate modifiers
  const warnings = validateFileTypeModifiers(baseType, modifiers);
  const warningsDiv = editor.querySelector("#validationWarnings");
  if (warningsDiv) {
    if (warnings.length > 0) {
      warningsDiv.innerHTML = warnings
        .map((w) => `<div class="validation-warning">${w}</div>`)
        .join("");
    } else {
      warningsDiv.innerHTML = "";
    }
  }
}

// Validate file type modifiers
function validateFileTypeModifiers(baseType, modifiers) {
  const warnings = [];

  // RCS keywords only make sense for text files
  if (
    baseType === "binary" &&
    (modifiers.includes("k") || modifiers.includes("ko"))
  ) {
    warnings.push("RCS keywords (+k) have no effect on binary files");
  }

  // Exclusive lock warning for text files
  if (baseType === "text" && modifiers.includes("l")) {
    warnings.push("Exclusive lock (+l) is typically used for binary files");
  }

  // Storage modifiers are mutually exclusive
  const storageModifiers = modifiers.filter((m) => ["C", "D", "F"].includes(m));
  if (storageModifiers.length > 1) {
    warnings.push("Only one storage modifier (+C, +D, +F) should be used");
  }

  // Keywords are mutually exclusive
  if (modifiers.includes("k") && modifiers.includes("ko")) {
    warnings.push("Cannot use both +k and +ko modifiers");
  }

  return warnings;
}

// Apply file type edit
function applyFileTypeEdit() {
  if (!editingRow) return;

  const editor = document.getElementById(`editor_${editingRow}`);
  if (!editor) return;

  const baseType = editor.querySelector("#baseFileType").value;

  // Get regular modifiers (exclude the S modifier checkbox)
  const modifiers = Array.from(
    editor.querySelectorAll(
      'input[type="checkbox"]:checked:not(#sModifierCheckbox)'
    )
  ).map((cb) => cb.value);

  // Handle the custom S modifier separately
  const sCheckbox = editor.querySelector("#sModifierCheckbox");
  const sValue = editor.querySelector("#sModifierValue");
  if (sCheckbox && sCheckbox.checked) {
    const revisionCount = sValue.value.trim();
    if (revisionCount && revisionCount !== "1") {
      modifiers.push(`S${revisionCount}`);
    } else {
      modifiers.push("S");
    }
  }

  const fullType =
    modifiers.length > 0 ? `${baseType}+${modifiers.join("")}` : baseType;

  // Update the rule
  const rule = typemapRules.find((r) => r.id === editingRow);
  if (rule) {
    rule.filetype = fullType;
    markAsChanged();
  }

  cancelFileTypeEdit();
  renderTable();
}

// Cancel file type edit
function cancelFileTypeEdit() {
  if (editingRow) {
    const editor = document.getElementById(`editor_${editingRow}`);
    if (editor) {
      editor.remove();
    }

    // Show the display again
    const row = document.querySelector(`[data-rule-id="${editingRow}"]`);
    if (row) {
      const display = row.querySelector(".file-type-display");
      if (display) {
        display.style.display = "block";
      }
    }

    editingRow = null;
  }
}

// Detect conflicts between rules
function detectAndShowConflicts() {
  // Clear existing conflict warnings
  document.querySelectorAll(".conflict-warning").forEach((el) => el.remove());

  // Check each rule against all later rules
  for (let i = 0; i < typemapRules.length; i++) {
    const conflicts = checkRuleConflicts(typemapRules[i]);

    if (conflicts.length > 0) {
      // Find the row and add conflict warning
      const row = document.querySelector(
        `[data-rule-id="${typemapRules[i].id}"]`
      );
      if (row) {
        const cell = row.querySelector(".file-type-cell");
        const warning = document.createElement("div");
        warning.className = "conflict-warning";
        warning.innerHTML = `⚠️ ${conflicts.join("; ")}`;
        cell.appendChild(warning);
      }
    }
  }
}

// Check conflicts for a specific rule
function checkRuleConflicts(rule) {
  const conflicts = [];
  const ruleIndex = typemapRules.findIndex((r) => r.id === rule.id);

  // Check against all later rules (which would override this one)
  for (let i = ruleIndex + 1; i < typemapRules.length; i++) {
    const laterRule = typemapRules[i];
    const overlap = checkPatternOverlap(rule.pattern, laterRule.pattern);

    if (overlap) {
      if (rule.filetype !== laterRule.filetype) {
        conflicts.push(
          `Overridden by rule ${laterRule.order} (${laterRule.filetype})`
        );
      } else {
        conflicts.push(`Duplicated by rule ${laterRule.order}`);
      }
    }
  }

  return conflicts;
}

// Check if two patterns overlap
function checkPatternOverlap(pattern1, pattern2) {
  // Exact match
  if (pattern1 === pattern2) {
    return { type: "exact" };
  }

  // Check if one pattern is more specific than the other
  // This is a simplified check - real implementation would be more sophisticated

  // Check for extension conflicts (same extension, different paths)
  const ext1 = extractExtension(pattern1);
  const ext2 = extractExtension(pattern2);

  if (ext1 && ext2 && ext1 === ext2) {
    // Same extension - check if one path contains the other
    const path1 = pattern1.replace(/\.\.\.\./g, "").replace(/\.\.\./g, "");
    const path2 = pattern2.replace(/\.\.\.\./g, "").replace(/\.\.\./g, "");

    if (path1.includes(path2) || path2.includes(path1)) {
      return { type: "specificity" };
    }
  }

  // Check for broad wildcards
  if ((pattern1 === "//..." || pattern2 === "//...") && pattern1 !== pattern2) {
    return { type: "broad_wildcard" };
  }

  return null;
}

// Extract file extension from pattern
function extractExtension(pattern) {
  const match = pattern.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1] : null;
}

// Save typemap back to Perforce
async function saveTypemap() {
  try {
    updateStatus("Saving typemap...");

    // Convert rules back to typemap format
    const typemapText = generateTypemapText();

    // Create form data for p4 typemap -i
    const formData = `# A Perforce Typemap Specification.\n#\nTypeMap:\n${typemapText}`;

    const result = await p4vjs.p4(["typemap", "-i"], formData);

    if (result.error) {
      throw new Error(result.error);
    }

    updateStatus("Typemap saved successfully");
    markAsSaved();

    // Refresh P4V if possible
    if (typeof p4vjs.refreshAll === "function") {
      p4vjs.refreshAll();
    }
  } catch (error) {
    updateStatus("Error saving typemap: " + error.message);
    alert("Error saving typemap: " + error.message);
  }
}

// Generate typemap text from rules
function generateTypemapText() {
  // Sort rules by execution order
  const sortedRules = [...typemapRules].sort((a, b) => a.order - b.order);

  const lines = [];

  for (const rule of sortedRules) {
    let line = `        ${rule.filetype} ${rule.pattern}`;

    if (rule.comment.trim()) {
      line += ` ## ${rule.comment}`;
    }

    lines.push(line);
  }

  return lines.join("\n");
}

// Update status message
function updateStatus(message) {
  const statusElement = document.getElementById("statusMessage");
  if (statusElement) {
    statusElement.textContent = message;
  }
}

// Update rule count display
function updateRuleCount() {
  const countElement = document.getElementById("ruleCount");
  if (countElement) {
    const count = typemapRules.length;
    countElement.textContent = `${count} rule${count !== 1 ? "s" : ""}`;
  }
}

// Column sorting functionality
function sortByColumn(column) {
  // Toggle sort direction if clicking the same column
  if (currentSortBy === column) {
    currentSortDirection = currentSortDirection === "asc" ? "desc" : "asc";
  } else {
    currentSortBy = column;
    currentSortDirection = "asc";
  }

  // Update header indicators
  updateSortHeaders();

  // Re-render table with new sort
  renderTable();
}

function updateSortHeaders() {
  // Clear all sort indicators
  document.querySelectorAll(".typemap-table th").forEach((th) => {
    th.classList.remove("sort-asc", "sort-desc");
  });

  // Add indicator to current sort column
  const columnMap = {
    order: 0,
    type: 1,
    pattern: 2,
    comment: 3,
  };

  const columnIndex = columnMap[currentSortBy];
  if (columnIndex !== undefined) {
    const headers = document.querySelectorAll(".typemap-table th");
    if (headers[columnIndex]) {
      headers[columnIndex].classList.add(
        currentSortDirection === "asc" ? "sort-asc" : "sort-desc"
      );
    }
  }
}

// Enhanced sorting function
function getSortedRules() {
  let sortedRules = [...typemapRules];

  sortedRules.sort((a, b) => {
    let comparison = 0;

    switch (currentSortBy) {
      case "order":
        comparison = a.order - b.order;
        break;
      case "pattern":
        comparison = a.pattern.localeCompare(b.pattern);
        break;
      case "type":
        comparison = a.filetype.localeCompare(b.filetype);
        break;
      case "comment":
        comparison = a.comment.localeCompare(b.comment);
        break;
      default:
        comparison = a.order - b.order;
    }

    return currentSortDirection === "desc" ? -comparison : comparison;
  });

  return sortedRules;
}

// Column resizing functionality
function startColumnResize(e, columnIndex) {
  e.preventDefault();
  e.stopPropagation();

  isResizing = true;
  currentColumn = columnIndex;
  startX = e.clientX;

  const table = document.getElementById("typemapTable");
  const headers = table.querySelectorAll("th");
  startWidth = headers[columnIndex].offsetWidth;

  document.addEventListener("mousemove", handleColumnResize);
  document.addEventListener("mouseup", stopColumnResize);

  // Add visual feedback
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
}

function handleColumnResize(e) {
  if (!isResizing) return;

  const deltaX = e.clientX - startX;
  const newWidth = Math.max(50, startWidth + deltaX); // Minimum width of 50px

  const table = document.getElementById("typemapTable");
  const headers = table.querySelectorAll("th");

  if (headers[currentColumn]) {
    headers[currentColumn].style.width = newWidth + "px";
  }
}

function stopColumnResize() {
  isResizing = false;
  currentColumn = -1;

  document.removeEventListener("mousemove", handleColumnResize);
  document.removeEventListener("mouseup", stopColumnResize);

  // Remove visual feedback
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
}

// Initialize theme detection
function initializeTheme() {
  // Apply dark theme class if using dark theme
  if (
    typeof p4vjs !== "undefined" &&
    p4vjs.useDarkTheme &&
    p4vjs.useDarkTheme()
  ) {
    document.body.classList.add("dark-theme");
  }
}

// Close file type editor when clicking outside
document.addEventListener("click", function (e) {
  if (editingRow) {
    const editor = document.getElementById(`editor_${editingRow}`);
    if (
      editor &&
      !editor.contains(e.target) &&
      !e.target.matches(".file-type-display")
    ) {
      // Don't close if clicking on overlay (let overlay onclick handle it)
      if (!e.target.matches(".editor-overlay")) {
        return;
      }
    }
  }
});

// Handle escape key to cancel editing
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && editingRow) {
    cancelFileTypeEdit();
  }
});
