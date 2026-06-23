"""Calendar utilities and text formatting."""

MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY = range(7)

month_name = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]
month_abbr = [
    "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]
day_name = [
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
]
day_abbr = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

_DAYS_IN_MONTH = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]


class IllegalMonthError(ValueError):
    def __init__(self, month):
        self.month = month

    def __str__(self):
        return "bad month number %r; must be 1-12" % self.month


def isleap(year):
    """Return True if year is a leap year."""
    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)


def leapdays(y1, y2):
    """Number of leap years in range [y1, y2)."""
    y1 -= 1
    y2 -= 1
    return (y2 // 4 - y1 // 4) - (y2 // 100 - y1 // 100) + (y2 // 400 - y1 // 400)


def _days_before_year(year):
    y = year - 1
    return y * 365 + y // 4 - y // 100 + y // 400


def weekday(year, month, day):
    """Return the day of the week (0=Monday) for the given date."""
    days = _days_before_year(year)
    for m in range(1, month):
        days += _DAYS_IN_MONTH[m]
        if m == 2 and isleap(year):
            days += 1
    days += day - 1
    # Jan 1 of year 1 was a Monday.
    return days % 7


def monthrange(year, month):
    """Return (weekday of first day, number of days) for month of year."""
    if not 1 <= month <= 12:
        raise IllegalMonthError(month)
    day1 = weekday(year, month, 1)
    ndays = _DAYS_IN_MONTH[month] + (month == 2 and isleap(year))
    return day1, ndays


class Calendar:
    """Provides iterators over months and weeks."""

    def __init__(self, firstweekday=0):
        self.firstweekday = firstweekday % 7

    def itermonthdays(self, year, month):
        """Yield day numbers for the month, with 0 for padding days."""
        day1, ndays = monthrange(year, month)
        leading = (day1 - self.firstweekday) % 7
        for _ in range(leading):
            yield 0
        for d in range(1, ndays + 1):
            yield d
        trailing = (leading + ndays) % 7
        if trailing:
            for _ in range(7 - trailing):
                yield 0

    def monthdayscalendar(self, year, month):
        """Return a list of weeks, each a list of 7 day numbers (0 = padding)."""
        days = list(self.itermonthdays(year, month))
        return [days[i:i + 7] for i in range(0, len(days), 7)]

    def iterweekdays(self):
        for i in range(self.firstweekday, self.firstweekday + 7):
            yield i % 7


class TextCalendar(Calendar):
    """Format calendars as plain text."""

    def formatday(self, day, width):
        s = "" if day == 0 else str(day)
        return s.rjust(width)

    def formatweek(self, week, width):
        return " ".join(self.formatday(d, width) for d in week)

    def formatweekheader(self, width):
        names = (day_abbr[i][:width].center(width) for i in self.iterweekdays())
        return " ".join(names)

    def formatmonthname(self, year, month, width, withyear=True):
        s = month_name[month]
        if withyear:
            s = "%s %d" % (s, year)
        return s.center(width)

    def formatmonth(self, year, month, w=0, l=0):
        w = max(2, w)
        l = max(1, l)
        weeks = self.monthdayscalendar(year, month)
        width = 7 * (w + 1) - 1
        lines = [self.formatmonthname(year, month, width).rstrip()]
        lines.append(self.formatweekheader(w).rstrip())
        for week in weeks:
            lines.append(self.formatweek(week, w).rstrip())
        sep = "\n" * l
        return sep.join(lines) + "\n"

    def prmonth(self, year, month, w=0, l=0):
        print(self.formatmonth(year, month, w, l), end="")
