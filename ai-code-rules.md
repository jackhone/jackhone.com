# AI Code Rules and Best Practices for HTML/CSS Development

## General Principles

1. **Clear Communication**
   - Be specific and detailed in your requests
   - Provide context about your project and goals
   - Specify exact requirements and constraints
   - Use consistent terminology

2. **Code Organization**
   - Keep HTML structure semantic and accessible
   - Use meaningful class names and IDs
   - Maintain consistent indentation and formatting
   - Group related styles together in CSS

3. **Version Control**
   - Commit changes frequently
   - Use descriptive commit messages
   - Review AI-generated code before committing
   - Keep a backup of working code

## HTML Best Practices

1. **Structure**
   - Use semantic HTML5 elements (`<header>`, `<nav>`, `<main>`, `<section>`, `<footer>`)
   - Maintain proper document outline
   - Include appropriate meta tags
   - Use descriptive alt text for images

2. **Accessibility**
   - Include ARIA labels where necessary
   - Ensure proper heading hierarchy
   - Add appropriate roles and landmarks
   - Test with screen readers

3. **Performance**
   - Optimize images before use
   - Minimize DOM nesting
   - Use appropriate meta viewport tags
   - Implement lazy loading for images

## CSS Best Practices

1. **Organization**
   - Use a consistent naming convention (BEM recommended)
   - Group related styles together
   - Comment complex CSS sections
   - Use CSS custom properties for theming

2. **Responsive Design**
   - Use relative units (rem, em, %) over fixed units
   - Implement mobile-first approach
   - Test across different viewport sizes
   - Use appropriate media queries

3. **Performance**
   - Minimize CSS specificity
   - Avoid !important declarations
   - Use efficient selectors
   - Consider CSS containment

## Working with AI

1. **Request Format**
   - Provide clear context
   - Specify exact requirements
   - Include relevant code snippets
   - Mention browser compatibility needs

2. **Code Review**
   - Review all AI-generated code
   - Test functionality thoroughly
   - Check for accessibility
   - Verify cross-browser compatibility

3. **Iteration**
   - Break down complex changes into smaller requests
   - Provide feedback on generated code
   - Ask for clarification when needed
   - Document successful patterns

## Common Pitfalls to Avoid

1. **HTML**
   - Over-nesting elements
   - Missing required attributes
   - Inconsistent indentation
   - Non-semantic markup

2. **CSS**
   - Over-specific selectors
   - Redundant styles
   - Inconsistent units
   - Missing vendor prefixes

3. **AI Interaction**
   - Vague requests
   - Missing context
   - Unclear requirements
   - Not reviewing generated code

## Testing and Validation

1. **HTML**
   - Validate markup using W3C validator
   - Check semantic structure
   - Verify accessibility
   - Test responsive behavior

2. **CSS**
   - Validate CSS syntax
   - Check browser compatibility
   - Test responsive breakpoints
   - Verify animations and transitions

## Documentation

1. **Code Comments**
   - Document complex logic
   - Explain non-obvious solutions
   - Note browser-specific fixes
   - Include TODO comments for future improvements

2. **Project Documentation**
   - Maintain README files
   - Document setup procedures
   - Include browser support information
   - Note known issues and limitations

## Security Considerations

1. **Input Validation**
   - Sanitize user input
   - Validate form data
   - Prevent XSS attacks
   - Use secure protocols

2. **Resource Loading**
   - Use HTTPS for external resources
   - Implement CSP headers
   - Minimize third-party dependencies
   - Audit external resources

## Performance Optimization

1. **Loading**
   - Optimize image sizes
   - Minimize HTTP requests
   - Use appropriate caching
   - Implement lazy loading

2. **Rendering**
   - Minimize reflows and repaints
   - Use efficient CSS selectors
   - Optimize animations
   - Consider critical CSS

## Maintenance

1. **Code Updates**
   - Keep dependencies updated
   - Remove unused code
   - Update documentation
   - Maintain consistent style

2. **Version Control**
   - Use meaningful commit messages
   - Create feature branches
   - Review changes before merging
   - Keep commit history clean

Remember: These guidelines should be adapted based on your specific project needs and team requirements. Regular review and updates to these practices will help maintain code quality and development efficiency. 