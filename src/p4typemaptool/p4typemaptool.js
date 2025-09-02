"use strict";

// Global state
let typemapRules = [];
let currentViewMode = "browse";
let currentSortBy = "order";
let editingRow = null;

// File type definitions
const fileTypes = {
  binary: {
    label: "Binary - Non-text file (images, executables, etc.)",
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
    label: "UTF-16 - Unicode file",
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
    label: "Compressed Storage",
    description: "Full compressed version per revision",
  },
  D: { label: "Delta Storage", description: "Store deltas in RCS format" },
  F: {
    label: "Full Uncompressed",
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
    updateStatus("Loading typemap...");
    await loadTypemap();
    updateStatus("Ready");
  } catch (error) {
    updateStatus("Error loading typemap: " + error.message);
    console.error("Initialization error:", error);
  }
}

// Load typemap from Perforce
async function loadTypemap() {
  try {
    const result = await p4vjs.p4(["typemap", "-o"]);

    if (result.error) {
      throw new Error(result.error);
    }
    console.log(result);
    // Parse the typemap data
    typemapRules = parseTypemapData(result.data);
    renderTable();
    updateRuleCount();

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

  if (data && data.length > 0 && data[0].TypeMap) {
    const typemapLines = data[0].TypeMap.split("\n");

    for (const line of typemapLines) {
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

// Get sorted rules based on current view mode and sort preference
function getSortedRules() {
  let sortedRules = [...typemapRules];

  if (currentViewMode === "browse" && currentSortBy !== "order") {
    sortedRules.sort((a, b) => {
      switch (currentSortBy) {
        case "pattern":
          return a.pattern.localeCompare(b.pattern);
        case "type":
          return a.filetype.localeCompare(b.filetype);
        default:
          return a.order - b.order;
      }
    });
  } else {
    // Always sort by execution order for order mode
    sortedRules.sort((a, b) => a.order - b.order);
  }

  return sortedRules;
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

  row.innerHTML = `
        <td class="drag-handle" ondragstart="dragStart(event)" draggable="true">⣿⣿</td>
        <td class="priority-cell">
            ${rule.order}
            ${
              currentViewMode === "browse" && currentSortBy !== "order"
                ? `<br><small style="color: #666;">(${
                    displayIndex + 1
                  })</small>`
                : ""
            }
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
            <button onclick="editFileType('${
              rule.id
            }')" class="btn" title="Edit">✏️</button>
            <button onclick="deleteRule('${
              rule.id
            }')" class="btn danger" title="Delete">🗑️</button>
            <button onclick="moveRuleUp('${
              rule.id
            }')" class="btn" title="Move Up">↑</button>
            <button onclick="moveRuleDown('${
              rule.id
            }')" class="btn" title="Move Down">↓</button>
        </td>
    `;

  return row;
}

// Get human-readable description of file type
function getFileTypeDescription(filetype) {
  const [baseType, modifierString] = filetype.split("+");
  const modifiers = modifierString ? modifierString.match(/.{1,2}/g) || [] : []; // Handle S10, S2, etc.

  let description = fileTypes[baseType]
    ? fileTypes[baseType].label.split(" - ")[1]
    : baseType;

  if (modifiers.length > 0) {
    const modifierDescriptions = modifiers
      .map((mod) => (fileModifiers[mod] ? fileModifiers[mod].label : `+${mod}`))
      .join(", ");
    description += ` + ${modifierDescriptions}`;
  }

  return description;
}

// Escape HTML for safe display
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Set view mode
function setViewMode(mode) {
  currentViewMode = mode;

  // Update button states
  document
    .getElementById("browseMode")
    .classList.toggle("active", mode === "browse");
  document
    .getElementById("orderMode")
    .classList.toggle("active", mode === "order");

  // Re-render table
  renderTable();
}

// Sort table
function sortTable() {
  const sortSelect = document.getElementById("sortBy");
  currentSortBy = sortSelect.value;
  renderTable();
}

// Update rule pattern
function updateRulePattern(ruleId, newPattern) {
  const rule = typemapRules.find((r) => r.id === ruleId);
  if (rule) {
    rule.pattern = newPattern;
    // Re-check conflicts when pattern changes
    setTimeout(() => renderTable(), 100);
  }
}

// Update rule comment
function updateRuleComment(ruleId, newComment) {
  const rule = typemapRules.find((r) => r.id === ruleId);
  if (rule) {
    rule.comment = newComment;
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
    renderTable();
    updateRuleCount();
  }
}

// Move rule up
function moveRuleUp(ruleId) {
  const ruleIndex = typemapRules.findIndex((r) => r.id === ruleId);
  if (ruleIndex > 0) {
    // Swap with previous rule
    [typemapRules[ruleIndex - 1], typemapRules[ruleIndex]] = [
      typemapRules[ruleIndex],
      typemapRules[ruleIndex - 1],
    ];
    reorderRules();
    renderTable();
  }
}

// Move rule down
function moveRuleDown(ruleId) {
  const ruleIndex = typemapRules.findIndex((r) => r.id === ruleId);
  if (ruleIndex < typemapRules.length - 1) {
    // Swap with next rule
    [typemapRules[ruleIndex], typemapRules[ruleIndex + 1]] = [
      typemapRules[ruleIndex + 1],
      typemapRules[ruleIndex],
    ];
    reorderRules();
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
  const modifiers = modifierString ? modifierString.match(/.{1,2}/g) || [] : [];

  editor.querySelector("#baseFileType").value = baseType;
  editor.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.checked = modifiers.includes(cb.value);
  });

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
  const modifiers = Array.from(
    editor.querySelectorAll('input[type="checkbox"]:checked')
  ).map((cb) => cb.value);

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
  const modifiers = Array.from(
    editor.querySelectorAll('input[type="checkbox"]:checked')
  ).map((cb) => cb.value);

  const fullType =
    modifiers.length > 0 ? `${baseType}+${modifiers.join("")}` : baseType;

  // Update the rule
  const rule = typemapRules.find((r) => r.id === editingRow);
  if (rule) {
    rule.filetype = fullType;
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

// Test a path against the current typemap
function testPath() {
  const pathInput = document.getElementById("testPath");
  const resultSpan = document.getElementById("testResult");
  const testPath = pathInput.value.trim();

  if (!testPath) {
    resultSpan.textContent = "";
    resultSpan.className = "test-result";
    return;
  }

  // Find the last matching rule (since later rules override earlier ones)
  let matchingRule = null;

  for (const rule of typemapRules) {
    if (pathMatchesPattern(testPath, rule.pattern)) {
      matchingRule = rule;
    }
  }

  if (matchingRule) {
    resultSpan.textContent = `Matches: ${matchingRule.filetype} (Rule ${matchingRule.order})`;
    resultSpan.className = "test-result match";
  } else {
    resultSpan.textContent = "No match - will use Perforce auto-detection";
    resultSpan.className = "test-result no-match";
  }
}

// Check if a path matches a pattern
function pathMatchesPattern(path, pattern) {
  // Convert Perforce pattern to regex
  // This is a simplified implementation - real P4 pattern matching is more complex
  let regexPattern = pattern
    .replace(/\.\.\.\./g, ".*") // Four dots: match anything including extension
    .replace(/\.\.\./g, "[^/]*") // Three dots: match anything in this directory level
    .replace(/\*/g, "[^/]*") // Single asterisk: match anything except directory separator
    .replace(/\?/g, ".") // Question mark: match any single character
    .replace(/\+/g, "\\+") // Escape plus signs
    .replace(/\(/g, "\\(") // Escape parentheses
    .replace(/\)/g, "\\)")
    .replace(/\[/g, "\\[") // Escape brackets
    .replace(/\]/g, "\\]");

  try {
    const regex = new RegExp("^" + regexPattern + ",i");
    return regex.test(path);
  } catch (e) {
    console.warn("Invalid pattern:", pattern, e);
    return false;
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

// Drag and drop functionality (basic implementation)
let draggedElement = null;

function dragStart(e) {
  draggedElement = e.target.closest("tr");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/html", draggedElement.outerHTML);
  draggedElement.style.opacity = "0.5";
}

function dragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
}

function drop(e) {
  e.preventDefault();

  if (draggedElement) {
    const targetRow = e.target.closest("tr");
    if (targetRow && targetRow !== draggedElement) {
      const tbody = targetRow.parentNode;

      // Determine if we're inserting before or after
      const rect = targetRow.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;

      if (e.clientY < midY) {
        tbody.insertBefore(draggedElement, targetRow);
      } else {
        tbody.insertBefore(draggedElement, targetRow.nextSibling);
      }

      // Update rule orders based on new DOM order
      updateRuleOrdersFromDOM();
    }

    draggedElement.style.opacity = "1";
    draggedElement = null;
  }
}

function updateRuleOrdersFromDOM() {
  const rows = document.querySelectorAll("#typemapTableBody tr");

  rows.forEach((row, index) => {
    const ruleId = row.getAttribute("data-rule-id");
    const rule = typemapRules.find((r) => r.id === ruleId);
    if (rule) {
      rule.order = index + 1;
    }
  });

  renderTable();
}

// Add event listeners for drag and drop
document.addEventListener("DOMContentLoaded", function () {
  const table = document.getElementById("typemapTable");
  if (table) {
    table.addEventListener("dragover", dragOver);
    table.addEventListener("drop", drop);
  }
});

// Handle Enter key in test path input
document.addEventListener("DOMContentLoaded", function () {
  const testPathInput = document.getElementById("testPath");
  if (testPathInput) {
    testPathInput.addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        testPath();
      }
    });
  }
});

// Close file type editor when clicking outside
document.addEventListener("click", function (e) {
  if (editingRow) {
    const editor = document.getElementById(`editor_${editingRow}`);
    if (
      editor &&
      !editor.contains(e.target) &&
      !e.target.matches(".file-type-display")
    ) {
      cancelFileTypeEdit();
    }
  }
});

// Handle escape key to cancel editing
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && editingRow) {
    cancelFileTypeEdit();
  }
});
