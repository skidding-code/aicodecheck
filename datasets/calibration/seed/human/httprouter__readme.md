# HttpRouter [![Coverage Status](https://coveralls.io/repos/github/julienschmidt/httprouter/badge.svg?branch=master)](https://coveralls.io/github/julienschmidt/httprouter?branch=master) [![Docs](https://godoc.org/github.com/julienschmidt/httprouter?status.svg)](http://pkg.go.dev/github.com/julienschmidt/httprouter)

HttpRouter is a lightweight high performance HTTP request router (also called *multiplexer* or just *mux* for short) for [Go](https://golang.org/).

In contrast to the [default mux](https://golang.org/pkg/net/http/#ServeMux) of Go's `net/http` package, this router supports variables in the routing pattern and matches against the request method. It also scales better.

The router is optimized for high performance and a small memory footprint. It scales well even with very long paths and a large number of routes. A compressing dynamic trie (radix tree) structure is used for efficient matching.

## Features

**Only explicit matches:** With other routers, like [`http.ServeMux`](https://golang.org/pkg/net/http/#ServeMux), a requested URL path could match multiple patterns. Therefore they have some awkward pattern priority rules, like *longest match* or *first registered, first matched*. By design of this router, a request can only match exactly one or no route. As a result, there are also no unintended matches, which makes it great for SEO and improves the user experience.

**Stop caring about trailing slashes:** Choose the URL style you like, the router automatically redirects the client if a trailing slash is missing or if there is one extra. Of course it only does so, if the new path has a handler. If you don't like it, you can [turn off this behavior](https://godoc.org/github.com/julienschmidt/httprouter#Router.RedirectTrailingSlash).

**Path auto-correction:** Besides detecting the missing or additional trailing slash at no extra cost, the router can also fix wrong cases and remove superfluous path elements (like `../` or `//`). Is [CAPTAIN CAPS LOCK](http://www.urbandictionary.com/define.php?term=Captain+Caps+Lock) one of your users? HttpRouter can help him by making a case-insensitive look-up and redirecting him to the correct URL.

**Parameters in your routing pattern:** Stop parsing the requested URL path, just give the path segment a name and the router delivers the dynamic value to you. Because of the design of the router, path parameters are very cheap.

**Zero Garbage:** The matching and dispatching process generates zero bytes of garbage. The only heap allocations that are made are building the slice of the key-value pairs for path parameters, and building new context and request objects (the latter only in the standard `Handler`/`HandlerFunc` API). In the 3-argument API, if the request path contains no parameters not a single heap allocation is necessary.

**Best Performance:** [Benchmarks speak for themselves](https://github.com/julienschmidt/go-http-routing-benchmark). See below for technical details of the implementation.

**No more server crashes:** You can set a [Panic handler](https://godoc.org/github.com/julienschmidt/httprouter#Router.PanicHandler) to deal with panics occurring during handling a HTTP request. The router then recovers and lets the `PanicHandler` log what happened and deliver a nice error page.

**Perfect for APIs:** The router design encourages to build sensible, hierarchical RESTful APIs. Moreover it has built-in native support for [OPTIONS requests](http://zacstewart.com/2012/04/14/http-options-method.html) and `405 Method Not Allowed` replies.

Of course you can also set **custom [`NotFound`](https://godoc.org/github.com/julienschmidt/httprouter#Router.NotFound) and  [`MethodNotAllowed`](https://godoc.org/github.com/julienschmidt/httprouter#Router.MethodNotAllowed) handlers** and [**serve static files**](https://godoc.org/github.com/julienschmidt/httprouter#Router.ServeFiles).

## Usage

This is just a quick introduction, view the [Docs](http://pkg.go.dev/github.com/julienschmidt/httprouter) for details.

    $ go get github.com/julienschmidt/httprouter

and use it, like in this trivial example:

```go
package main

import (
    "fmt"
    "net/http"
    "log"

    "github.com/julienschmidt/httprouter"
)

func Index(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
    fmt.Fprint(w, "Welcome!\n")
}

func Hello(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
    fmt.Fprintf(w, "hello, %s!\n", ps.ByName("name"))
}

func main() {
    router := httprouter.New()
    router.GET("/", Index)
    router.GET("/hello/:name", Hello)

    log.Fatal(http.ListenAndServe(":8080", router))
}
```

### Named parameters

As you can see, `:name` is a *named parameter*. The values are accessible via `httprouter.Params`, which is just a slice of `httprouter.Param`s. You can get the value of a parameter either by its index in the slice, or by using the `ByName(name)` method: `:name` can be retrieved by `ByName("name")`.

When using a `http.Handler` (using `router.Handler` or `http.HandlerFunc`) instead of HttpRouter's handle API using a 3rd function parameter, the named parameters are stored in the `request.Context`. See more below under [Why doesn't this work with http.Handler?](#why-doesnt-this-work-with-httphandler).

Named parameters only match a single path segment:

```
Pattern: /user/:user

 /user/gordon              match
 /user/you                 match
 /user/gordon/profile      no match
 /user/                    no match
```

**Note:** Since this router has only explicit matches, you can not register static routes and parameters for the same path segment. For example you can not register the patterns `/user/new` and `/user/:user` for the same request method at the same time. The routing of different request methods is independent from each other.

### Catch-All parameters

The second type are *catch-all* parameters and have the form `*name`. Like the name suggests, they match everything. Therefore they must always be at the