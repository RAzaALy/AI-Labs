#!/usr/bin/env python3
"""Authoring helper: derive a lab starter from its solution by replacing function bodies with TODO stubs.
Usage (from a script): from stub import stub_bodies; stub_bodies(src, {"export function foo": "  // TODO...\n  throw new Error('TODO: foo');"})"""
def _body_span(s, i):
    k = s.index('(', i); depth = 0
    while True:
        c = s[k]
        if c == '(': depth += 1
        elif c == ')':
            depth -= 1
            if depth == 0: break
        k += 1
    j = s.index('{\n', k)  # body brace is the one followed by a newline (skips `{ a: string }` return types)
    depth = 0; m = j
    while True:
        if s[m] == '{': depth += 1
        elif s[m] == '}':
            depth -= 1
            if depth == 0: return j, m
        m += 1

def stub_bodies(src, stubs):
    for sig, todo in stubs.items():
        i = src.index(sig)
        j, m = _body_span(src, i)
        src = src[:j] + '{\n' + todo.rstrip() + '\n}' + src[m + 1:]
    return src
