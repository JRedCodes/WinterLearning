# legacy/: the JavaScript you are porting

These files are the original, untyped utility library from the team's old
codebase. They work (mostly), and they are **reference only**: nothing imports
them, the tests don't run them, and the compiler doesn't check them.

Port each one into the matching file in `../src/` with strict types. Read the
`// NOTE:` comments: they point at places where JavaScript let a bug or an
ambiguity slip through that TypeScript should now catch for you.
