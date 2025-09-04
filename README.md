# P4 Typemap GUI Tool

A modern, user-friendly GUI tool for managing Perforce typemap configurations within P4V and P4Admin.

## Project Structure

The project has been refactored and organized for better maintainability and reusability:

```
src/
├── shared/
│   ├── p4-utilities.js          # Shared utilities for P4V tools
│   ├── style.css                # Light theme styles (shared)
│   └── darkstyle.css            # Dark theme styles (shared)
├── config/
│   └── template-config.js       # Template configuration (user-editable)
├── p4typemaptool/
│   ├── p4typemaptool.html      # Main HTML interface
│   ├── p4typemaptool.js        # Core application logic
│   └── p4typemaptool.css       # Tool-specific styles
└── README.md                   # This file
```

## Key Improvements

### 1. Shared Utilities (`src/shared/p4-utilities.js`)

Extracted reusable utility functions that can be shared across P4V and P4Admin tools:

- **HTML & String Utilities**: `escapeHtml()`, `generateId()`, `generateFriendlyName()`
- **Status Management**: `updateStatus()`, `updateStatusWithModifiedState()`
- **Theme Support**: `initializeTheme()`
- **Network Operations**: `loadUrlWithFallback()`, `loadUrlWithXHR()`
- **Template Processing**: `extractTemplateMetadata()`
- **Validation**: `validateDepotPath()`
- **Data Utilities**: `deepClone()`, `debounce()`, `formatFileSize()`

### 2. Template Configuration (`src/config/template-config.js`)

Separated template configuration into its own file for easy customization:

- **Template URLs**: Centralized list of available templates
- **Categories**: Organization system for templates
- **Settings**: Configurable options for template loading
- **Validation Rules**: Template content validation

Users can easily add their own templates by modifying this file.

### 3. External Stylesheets

Moved all inline styles to external CSS files:

- **Tool-specific styles**: `p4typemaptool.css`
- **Theme compatibility**: Works with existing `style.css` and `darkstyle.css`
- **Better maintainability**: Easier to modify and extend styles

### 4. Cleaner Code Organization

- Removed code duplication
- Improved function organization
- Better separation of concerns
- Enhanced readability and maintainability

## Usage

### Adding Custom Templates

To add your own typemap templates, edit `src/config/template-config.js`:

```javascript
getTemplateUrls() {
  return [
    // Existing templates...
    {
      name: "Your Custom Template",
      description: "Description of your template",
      url: "https://your-server.com/path/to/template.typemap",
    },
    // Add more templates here
  ];
}
```

Templates can be hosted on:
- GitHub Gists (raw URLs)
- GitHub repositories (raw.githubusercontent.com URLs)
- Any publicly accessible web server
- Local file:// URLs (for internal company templates)

### Using Shared Utilities in Other Tools

Other P4V/P4Admin tools can leverage the shared utilities:

```javascript
// Include the utilities
<script src="../shared/p4-utilities.js"></script>

// Use the utilities
const uniqueId = P4Utils.generateId("myTool");
P4Utils.updateStatus("Loading...");
P4Utils.initializeTheme();
```

## Features

### Core Functionality
- **Visual Typemap Editor**: Intuitive interface for managing typemap rules
- **Rule Ordering**: Drag-and-drop style ordering with up/down buttons
- **Conflict Detection**: Automatic detection and highlighting of rule conflicts
- **Template System**: Load predefined templates for common scenarios
- **Pattern Validation**: Real-time validation of depot path patterns
- **File Type Builder**: Visual builder for complex file type specifications

### User Experience
- **Theme Support**: Automatic light/dark theme detection
- **Responsive Design**: Works well in different window sizes
- **Keyboard Shortcuts**: ESC to cancel editing, etc.
- **Status Feedback**: Clear status messages and progress indicators
- **Unsaved Changes**: Tracks and warns about unsaved modifications

### Technical Features
- **Modular Architecture**: Clean separation of concerns
- **Reusable Components**: Shared utilities for other tools
- **Error Handling**: Robust error handling and user feedback
- **Performance**: Efficient rendering and conflict detection
- **Extensibility**: Easy to add new features and templates

## Development

### File Dependencies

```
p4typemaptool.html
├── ../shared/darkstyle.css (conditional)
├── ../shared/style.css (conditional)
├── p4typemaptool.css
├── ../shared/p4-utilities.js
├── ../config/template-config.js
└── p4typemaptool.js
```

### Adding New Utilities

When adding new shared utilities to `p4-utilities.js`:

1. Add comprehensive JSDoc documentation
2. Include error handling
3. Make functions generic and reusable
4. Test with both light and dark themes
5. Update this README with new functionality

### Extending Templates

The template system supports:
- **Metadata extraction** from template comments
- **Conflict resolution** when merging templates
- **Progress feedback** during loading
- **Error handling** for network issues
- **Caching** for improved performance

## Browser Compatibility

The tool is designed to work within P4V's embedded browser environment and supports:
- Modern JavaScript features (ES6+)
- CSS Grid and Flexbox layouts
- Fetch API with XHR fallback
- File:// protocol handling for local templates

## Maintenance

### Regular Tasks
- Update template URLs if they change
- Add new templates as they become available
- Review and update shared utilities
- Test with new P4V versions

### Troubleshooting
- Check browser console for JavaScript errors
- Verify template URLs are accessible
- Ensure P4V has network access for template loading
- Test theme switching functionality

## Contributing

When making changes:
1. Maintain the modular structure
2. Update shared utilities for reusable functionality
3. Add appropriate error handling
4. Test with both themes
5. Update documentation as needed

## License

This tool is part of the P4V ecosystem and follows the same licensing terms.
