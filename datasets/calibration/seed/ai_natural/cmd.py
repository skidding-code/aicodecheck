"""A generic framework for line-oriented command interpreters."""

import sys

__all__ = ["Cmd"]

PROMPT = "(Cmd) "
IDENTCHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_"


class Cmd:
    """A line-oriented command interpreter base class.

    Subclasses define do_<command> methods to handle commands, and may add
    help_<command> methods for help text. The interpreter reads lines, splits
    off the command word, and dispatches to the matching do_ method.
    """

    prompt = PROMPT
    identchars = IDENTCHARS
    ruler = "="
    lastcmd = ""
    intro = None
    doc_leader = ""
    doc_header = "Documented commands (type help <topic>):"
    misc_header = "Miscellaneous help topics:"
    undoc_header = "Undocumented commands:"
    nohelp = "*** No help on %s"

    def __init__(self, completekey="tab", stdin=None, stdout=None):
        self.stdin = stdin if stdin is not None else sys.stdin
        self.stdout = stdout if stdout is not None else sys.stdout
        self.completekey = completekey
        self.cmdqueue = []

    def cmdloop(self, intro=None):
        """Repeatedly read input, parse, and dispatch to action methods."""
        self.preloop()
        try:
            if intro is not None:
                self.intro = intro
            if self.intro:
                self.stdout.write(str(self.intro) + "\n")
            stop = None
            while not stop:
                if self.cmdqueue:
                    line = self.cmdqueue.pop(0)
                else:
                    try:
                        self.stdout.write(self.prompt)
                        self.stdout.flush()
                        line = self.stdin.readline()
                    except EOFError:
                        line = "EOF"
                    else:
                        if not line:
                            line = "EOF"
                        else:
                            line = line.rstrip("\r\n")
                line = self.precmd(line)
                stop = self.onecmd(line)
                stop = self.postcmd(stop, line)
            self.postloop()
        finally:
            pass

    def precmd(self, line):
        return line

    def postcmd(self, stop, line):
        return stop

    def preloop(self):
        pass

    def postloop(self):
        pass

    def parseline(self, line):
        """Parse a line into (command, args, line). Returns (None, None, line)
        for an empty line."""
        line = line.strip()
        if not line:
            return None, None, line
        elif line[0] == "?":
            line = "help " + line[1:]
        elif line[0] == "!":
            if hasattr(self, "do_shell"):
                line = "shell " + line[1:]
            else:
                return None, None, line
        i, n = 0, len(line)
        while i < n and line[i] in self.identchars:
            i += 1
        cmd, arg = line[:i], line[i:].strip()
        return cmd, arg, line

    def onecmd(self, line):
        """Interpret a line. May be overridden, but should not normally need
        to be."""
        cmd, arg, line = self.parseline(line)
        if not line:
            return self.emptyline()
        if cmd is None:
            return self.default(line)
        self.lastcmd = line
        if line == "EOF":
            self.lastcmd = ""
        if cmd == "":
            return self.default(line)
        try:
            func = getattr(self, "do_" + cmd)
        except AttributeError:
            return self.default(line)
        return func(arg)

    def emptyline(self):
        """Repeat the last command on an empty line."""
        if self.lastcmd:
            return self.onecmd(self.lastcmd)

    def default(self, line):
        self.stdout.write("*** Unknown syntax: %s\n" % line)

    def get_names(self):
        return dir(self.__class__)

    def do_help(self, arg):
        """List available commands or show help for a specific command."""
        if arg:
            try:
                func = getattr(self, "help_" + arg)
            except AttributeError:
                try:
                    doc = getattr(self, "do_" + arg).__doc__
                    if doc:
                        self.stdout.write("%s\n" % str(doc))
                        return
                except AttributeError:
                    pass
                self.stdout.write("%s\n" % str(self.nohelp % (arg,)))
                return
            func()
            return

        names = self.get_names()
        cmds_doc = []
        cmds_undoc = []
        topics = set()
        for name in names:
            if name[:5] == "help_":
                topics.add(name[5:])
        names.sort()
        prevname = ""
        for name in names:
            if name[:3] == "do_":
                if name == prevname:
                    continue
                prevname = name
                cmd = name[3:]
                if cmd in topics:
                    cmds_doc.append(cmd)
                    topics.discard(cmd)
                elif getattr(self, name).__doc__:
                    cmds_doc.append(cmd)
                else:
                    cmds_undoc.append(cmd)
        self.stdout.write("%s\n" % str(self.doc_leader))
        self.print_topics(self.doc_header, cmds_doc, 15, 80)
        self.print_topics(self.misc_header, sorted(topics), 15, 80)
        self.print_topics(self.undoc_header, cmds_undoc, 15, 80)

    def print_topics(self, header, cmds, cmdlen, maxcol):
        if cmds:
            self.stdout.write("%s\n" % str(header))
            if self.ruler:
                self.stdout.write("%s\n" % str(self.ruler * len(header)))
            self.columnize(cmds, maxcol - 1)
            self.stdout.write("\n")

    def columnize(self, list, displaywidth=80):
        """Display a list of strings as a compact set of columns."""
        if not list:
            self.stdout.write("<empty>\n")
            return

        nonstrings = [i for i in range(len(list)) if not isinstance(list[i], str)]
        if nonstrings:
            raise TypeError(
                "list[i] not a string for i in %s" % ", ".join(map(str, nonstrings))
            )
        size = len(list)
        if size == 1:
            self.stdout.write("%s\n" % str(list[0]))
            return
        for nrows in range(1, len(list)):
            ncols = (size + nrows - 1) // nrows
            colwidths = []
            totwidth = -2
            for col in range(ncols):
                colwidth = 0
                for row in range(nrows):
                    i = row + nrows * col
                    if i >= size:
                        break
                    colwidth = max(colwidth, len(list[i]))
                colwidths.append(colwidth)
                totwidth += colwidth + 2
                if totwidth > displaywidth:
                    break
            if totwidth <= displaywidth:
                break
        else:
            nrows = len(list)
            ncols = 1
            colwidths = [0]
        for row in range(nrows):
            texts = []
            for col in range(ncols):
                i = row + nrows * col
                texts.append("" if i >= size else list[i])
            while texts and not texts[-1]:
                del texts[-1]
            for col in range(len(texts)):
                texts[col] = texts[col].ljust(colwidths[col])
            self.stdout.write("%s\n" % str("  ".join(texts)))
