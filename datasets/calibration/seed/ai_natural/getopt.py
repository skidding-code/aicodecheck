"""Parser for command line options, in the classic getopt style."""

__all__ = ["GetoptError", "error", "getopt", "gnu_getopt"]


class GetoptError(Exception):
    def __init__(self, msg, opt=""):
        self.msg = msg
        self.opt = opt
        super().__init__(msg, opt)

    def __str__(self):
        return self.msg


error = GetoptError


def getopt(args, shortopts, longopts=None):
    """Parse command line options.

    Returns (opts, args) where opts is a list of (option, value) pairs and
    args is the list of remaining program arguments. Parsing stops at the
    first non-option argument.
    """
    if longopts is None:
        longopts = []
    elif isinstance(longopts, str):
        longopts = [longopts]
    else:
        longopts = list(longopts)

    opts = []
    args = list(args)
    while args and args[0].startswith("-") and args[0] != "-":
        if args[0] == "--":
            args = args[1:]
            break
        if args[0].startswith("--"):
            opts, args = do_longs(opts, args[0][2:], longopts, args[1:])
        else:
            opts, args = do_shorts(opts, args[0][1:], shortopts, args[1:])
    return opts, args


def gnu_getopt(args, shortopts, longopts=None):
    """Like getopt, but allows options and non-options to be intermixed.

    If shortopts begins with '+', or the POSIXLY_CORRECT environment variable
    is set, option processing stops at the first non-option (POSIX behavior).
    """
    import os

    if longopts is None:
        longopts = []
    elif isinstance(longopts, str):
        longopts = [longopts]
    else:
        longopts = list(longopts)

    opts = []
    prog_args = []

    if shortopts.startswith("+"):
        shortopts = shortopts[1:]
        all_options_first = True
    elif os.environ.get("POSIXLY_CORRECT"):
        all_options_first = True
    else:
        all_options_first = False

    args = list(args)
    while args:
        if args[0] == "--":
            prog_args += args[1:]
            break
        if args[0].startswith("--"):
            opts, args = do_longs(opts, args[0][2:], longopts, args[1:])
        elif args[0].startswith("-") and args[0] != "-":
            opts, args = do_shorts(opts, args[0][1:], shortopts, args[1:])
        else:
            if all_options_first:
                prog_args += args
                break
            prog_args.append(args[0])
            args = args[1:]

    return opts, prog_args


def do_longs(opts, opt, longopts, args):
    try:
        i = opt.index("=")
    except ValueError:
        optarg = None
    else:
        opt, optarg = opt[:i], opt[i + 1:]

    has_arg, opt = long_has_args(opt, longopts)
    if has_arg:
        if optarg is None:
            if not args:
                raise GetoptError("option --%s requires argument" % opt, opt)
            optarg, args = args[0], args[1:]
    elif optarg is not None:
        raise GetoptError("option --%s must not have an argument" % opt, opt)
    opts.append(("--" + opt, optarg or ""))
    return opts, args


def long_has_args(opt, longopts):
    possibilities = [o for o in longopts if o.startswith(opt)]
    if not possibilities:
        raise GetoptError("option --%s not recognized" % opt, opt)
    # Is there an exact match?
    if opt in possibilities:
        return False, opt
    elif opt + "=" in possibilities:
        return True, opt
    if len(possibilities) > 1:
        raise GetoptError("option --%s not a unique prefix" % opt, opt)
    assert len(possibilities) == 1
    unique_match = possibilities[0]
    has_arg = unique_match.endswith("=")
    if has_arg:
        unique_match = unique_match[:-1]
    return has_arg, unique_match


def do_shorts(opts, optstring, shortopts, args):
    while optstring != "":
        opt, optstring = optstring[0], optstring[1:]
        if short_has_arg(opt, shortopts):
            if optstring == "":
                if not args:
                    raise GetoptError("option -%s requires argument" % opt, opt)
                optstring, args = args[0], args[1:]
            optarg, optstring = optstring, ""
        else:
            optarg = ""
        opts.append(("-" + opt, optarg))
    return opts, args


def short_has_arg(opt, shortopts):
    for i in range(len(shortopts)):
        if opt == shortopts[i] != ":":
            return shortopts.startswith(":", i + 1)
    raise GetoptError("option -%s not recognized" % opt, opt)
